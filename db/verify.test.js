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
  const queryInterface = {
    sequelize: { query: async () => calls.push(['query']) },
    addColumn: async (...args) => calls.push(['addColumn', ...args]),
    addIndex: async (...args) => calls.push(['addIndex', ...args]),
    removeIndex: async (...args) => calls.push(['removeIndex', ...args]),
    removeColumn: async (...args) => calls.push(['removeColumn', ...args]),
  };

  await balanceNetworkMigration.up(queryInterface, { STRING: 'STRING' });

  assert.deepEqual(calls, [
    ['addColumn', 'balance_cache_entries', 'network', { type: 'STRING', allowNull: true }],
    ['query'],
    [
      'addIndex',
      'balance_cache_entries',
      ['user_id', 'wallet_id', 'network', 'asset_id'],
      { unique: true },
    ],
  ]);

  calls.length = 0;
  await balanceNetworkMigration.down(queryInterface, { STRING: 'STRING' });
  assert.deepEqual(calls, [
    ['removeIndex', 'balance_cache_entries', ['user_id', 'wallet_id', 'network', 'asset_id']],
    ['removeColumn', 'balance_cache_entries', 'network'],
  ]);
});
