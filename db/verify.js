'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_TABLES = ['app_users', 'wallet_links', 'auth_audit_events'];

function expectedMigrations(directory = path.join(__dirname, 'migrations')) {
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.js'))
    .sort();
}

function verifyState(expected, applied, requiredTables, existingTables) {
  const appliedSet = new Set(applied);
  const tableSet = new Set(existingTables);
  return {
    pendingMigrations: expected.filter((name) => !appliedSet.has(name)),
    missingTables: requiredTables.filter((name) => !tableSet.has(name)),
  };
}

function connectionConfig() {
  const environment = process.env.NODE_ENV || 'development';
  const config = require('./config')[environment];
  if (!config) {
    throw new Error(`Unknown database environment: ${environment}`);
  }
  if (config.url) {
    return { connectionString: config.url };
  }
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
  };
}

async function inspectDatabase(client) {
  const metadata = await client.query("SELECT to_regclass('\"SequelizeMeta\"') AS table_name");
  let applied = [];
  if (metadata.rows[0].table_name) {
    const result = await client.query('SELECT name FROM "SequelizeMeta" ORDER BY name');
    applied = result.rows.map(({ name }) => name);
  }

  const tables = await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])`,
    [REQUIRED_TABLES],
  );

  return verifyState(
    expectedMigrations(),
    applied,
    REQUIRED_TABLES,
    tables.rows.map(({ table_name: tableName }) => tableName),
  );
}

async function main() {
  const { Client } = require('pg');
  const client = new Client(connectionConfig());
  await client.connect();
  try {
    const result = await inspectDatabase(client);
    if (result.pendingMigrations.length || result.missingTables.length) {
      if (result.pendingMigrations.length) {
        console.error(`Pending database migrations: ${result.pendingMigrations.join(', ')}`);
      }
      if (result.missingTables.length) {
        console.error(`Missing required database tables: ${result.missingTables.join(', ')}`);
      }
      process.exitCode = 1;
      return;
    }
    console.log('Database migration and schema verification passed.');
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Database verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { REQUIRED_TABLES, expectedMigrations, verifyState };
