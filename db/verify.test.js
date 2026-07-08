'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyState } = require('./verify');

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
