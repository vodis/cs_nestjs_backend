'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { REQUIRED_TABLES, verifyState } = require('./verify');
const balanceNetworkMigration = require('./migrations/20260830000100-add-balance-cache-network');
const swapExecutionMigration = require('./migrations/20260923000100-create-swap-execution-state');

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
