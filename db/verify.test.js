'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyState } = require('./verify');
const balanceNetworkMigration = require('./migrations/20260830000100-add-balance-cache-network');

test('reports pending migrations and missing required tables', () => {
  const result = verifyState(
    ['001-existing.js', '002-pending.js'],
    ['001-existing.js'],
    ['app_users', 'wallet_links'],
    ['app_users'],
  );

  assert.deepEqual(result, {
    pendingMigrations: ['002-pending.js'],
    missingTables: ['wallet_links'],
  });
});

test('passes when migrations and required tables are present', () => {
  const result = verifyState(
    ['001-existing.js'],
    ['001-existing.js'],
    ['app_users'],
    ['app_users'],
  );

  assert.deepEqual(result, { pendingMigrations: [], missingTables: [] });
});

test('balance network expansion preserves the legacy upsert index', async () => {
  const calls = [];
  const transaction = {};
  const queryInterface = {
    sequelize: {
      transaction: async (callback) => callback(transaction),
      query: async (_sql, options) => {
        assert.equal(options.transaction, transaction);
        calls.push(['query']);
      },
    },
    addColumn: async (...args) => calls.push(['addColumn', ...args]),
    addIndex: async (...args) => calls.push(['addIndex', ...args]),
    removeIndex: async (...args) => calls.push(['removeIndex', ...args]),
    removeColumn: async (...args) => calls.push(['removeColumn', ...args]),
  };

  await balanceNetworkMigration.up(queryInterface, { STRING: 'STRING' });

  assert.deepEqual(calls, [
    ['addColumn', 'balance_cache_entries', 'network', { type: 'STRING', allowNull: true }, { transaction }],
    ['query'],
    [
      'addIndex',
      'balance_cache_entries',
      ['user_id', 'wallet_id', 'network', 'asset_id'],
      { unique: true, transaction },
    ],
  ]);

  calls.length = 0;
  await balanceNetworkMigration.down(queryInterface, { STRING: 'STRING' });
  assert.deepEqual(calls, [
    ['removeIndex', 'balance_cache_entries', ['user_id', 'wallet_id', 'network', 'asset_id'], { transaction }],
    ['removeColumn', 'balance_cache_entries', 'network', { transaction }],
  ]);
});

for (const direction of ['up', 'down']) {
  test(`balance network ${direction} rolls back a late failure and can retry`, async () => {
    let state = { column: direction === 'down', index: direction === 'down' };
    let fail = true;
    let active;
    const apply = (options, change) => {
      assert.equal(options.transaction, active);
      change(active);
    };
    const queryInterface = {
      sequelize: {
        transaction: async (callback) => {
          active = { ...state };
          try {
            await callback(active);
            state = { ...active };
          } finally { active = undefined; }
        },
        query: async (_sql, options) => apply(options, () => {}),
      },
      addColumn: async (_table, _column, _definition, options) => apply(options, (tx) => {
        assert.equal(tx.column, false, 'duplicate column');
        tx.column = true;
      }),
      addIndex: async (_table, _fields, options) => apply(options, (tx) => {
        if (fail) throw new Error('index failure');
        tx.index = true;
      }),
      removeIndex: async (_table, _fields, options) => apply(options, (tx) => {
        assert.equal(tx.index, true, 'missing index');
        tx.index = false;
      }),
      removeColumn: async (_table, _column, options) => apply(options, (tx) => {
        if (fail) throw new Error('column failure');
        tx.column = false;
      }),
    };
    const initial = { ...state };
    await assert.rejects(balanceNetworkMigration[direction](queryInterface, { STRING: 'STRING' }), /failure/);
    assert.deepEqual(state, initial);
    fail = false;
    await balanceNetworkMigration[direction](queryInterface, { STRING: 'STRING' });
    assert.deepEqual(state, { column: direction === 'up', index: direction === 'up' });
  });
}
