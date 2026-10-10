'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { REQUIRED_TABLES, verifyState } = require('./verify');
const balanceNetworkMigration = require('./migrations/20260830000100-add-balance-cache-network');
const swapExecutionMigration = require('./migrations/20260923000100-create-swap-execution-state');
const swapSettlementMigration = require('./migrations/20260927000100-add-swap-settlement-status');

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

test('requires durable swap preparation and execution tables', () => {
  assert.ok(REQUIRED_TABLES.includes('swap_preparations'));
  assert.ok(REQUIRED_TABLES.includes('swap_executions'));
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

test('swap execution migration creates reversible idempotency state', async () => {
  const calls = [];
  const queryInterface = {
    createTable: async (name) => calls.push(['createTable', name]),
    addIndex: async (table, fields, options = {}) =>
      calls.push(['addIndex', table, fields, options.name]),
    dropTable: async (name) => calls.push(['dropTable', name]),
  };
  const STRING = (length) => `STRING(${length})`;
  Object.assign(STRING, { key: 'STRING' });
  const Sequelize = {
    UUID: 'UUID',
    STRING,
    JSONB: 'JSONB',
    DATE: 'DATE',
    literal: (value) => value,
    fn: (value) => value,
  };

  await swapExecutionMigration.up(queryInterface, Sequelize);
  assert.deepEqual(calls, [
    ['createTable', 'swap_preparations'],
    ['addIndex', 'swap_preparations', ['expires_at'], undefined],
    ['createTable', 'swap_executions'],
    [
      'addIndex',
      'swap_executions',
      ['user_id', 'idempotency_key'],
      'swap_executions_user_idempotency_unique',
    ],
    [
      'addIndex',
      'swap_executions',
      ['user_id', 'request_fingerprint'],
      'swap_executions_user_fingerprint_unique',
    ],
    ['addIndex', 'swap_executions', ['preparation_id'], undefined],
  ]);

  calls.length = 0;
  await swapExecutionMigration.down(queryInterface);
  assert.deepEqual(calls, [
    ['dropTable', 'swap_executions'],
    ['dropTable', 'swap_preparations'],
  ]);
});

test('swap settlement migration adds and removes the terminal status column', async () => {
  const calls = [];
  const queryInterface = {
    addColumn: async (...args) => calls.push(['addColumn', ...args]),
    removeColumn: async (...args) => calls.push(['removeColumn', ...args]),
  };

  await swapSettlementMigration.up(queryInterface, { STRING: 'STRING' });
  assert.deepEqual(calls, [
    ['addColumn', 'swap_preparations', 'settlement_status', { type: 'STRING', allowNull: true }],
  ]);

  calls.length = 0;
  await swapSettlementMigration.down(queryInterface);
  assert.deepEqual(calls, [['removeColumn', 'swap_preparations', 'settlement_status']]);
});


test('swap history migration preserves legacy rows through expansion and rollback', async () => {
  const { Sequelize, DataTypes } = require('sequelize');
  const migration = require('./migrations/20261010000100-add-swap-history');
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  const query = db.getQueryInterface();
  try {
    await query.createTable('swap_preparations', {
      id: { type: DataTypes.UUID, primaryKey: true },
      created_at: { type: DataTypes.DATE },
    });
    const id = '11111111-1111-4111-8111-111111111111';
    await query.bulkInsert('swap_preparations', [{ id, created_at: new Date() }]);
    await migration.up(query, DataTypes);
    const columns = await query.describeTable('swap_preparations');
    for (const key of ['user_id', 'history_data', 'attempt_started_at']) assert.equal(columns[key].allowNull, true);
    assert.ok((await query.showIndex('swap_preparations')).some((index) => index.name === 'swap_history_user_created'));
    const [rows] = await db.query('SELECT id, user_id, history_data, attempt_started_at FROM swap_preparations');
    assert.deepEqual(rows, [{ id, user_id: null, history_data: null, attempt_started_at: null }]);
    await migration.down(query);
    assert.deepEqual(Object.keys(await query.describeTable('swap_preparations')).sort(), ['created_at', 'id']);
    const [retained] = await db.query('SELECT id FROM swap_preparations');
    assert.deepEqual(retained, [{ id }]);
  } finally {
    await db.close();
  }
});
