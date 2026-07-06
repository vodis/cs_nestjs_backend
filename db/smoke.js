'use strict';

const { Sequelize, QueryTypes } = require('sequelize');
const configurations = require('./config');

const REQUIRED_TABLES = ['app_users', 'wallet_links', 'auth_audit_events'];

async function main() {
  const config = configurations[process.env.NODE_ENV || 'development'];
  const sequelize = config.url ? new Sequelize(config.url, config) : new Sequelize(config);

  try {
    await sequelize.authenticate();
    const rows = await sequelize.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name IN (:requiredTables)`,
      { replacements: { requiredTables: REQUIRED_TABLES }, type: QueryTypes.SELECT },
    );
    const found = new Set(rows.map(({ table_name: tableName }) => tableName));
    const missing = REQUIRED_TABLES.filter((tableName) => !found.has(tableName));
    if (missing.length > 0) {
      throw new Error(`database smoke failed; missing tables: ${missing.join(', ')}`);
    }
    process.stdout.write('database-smoke-ok\n');
  } finally {
    await sequelize.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
