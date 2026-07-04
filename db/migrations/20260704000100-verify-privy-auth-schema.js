'use strict';

const REQUIRED_TABLES = ['app_users', 'wallet_links', 'auth_audit_events'];

module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name IN (:requiredTables)`,
      { replacements: { requiredTables: REQUIRED_TABLES } },
    );

    const existingTables = new Set(rows.map(({ table_name: tableName }) => tableName));
    const missingTables = REQUIRED_TABLES.filter((tableName) => !existingTables.has(tableName));

    if (missingTables.length > 0) {
      throw new Error(`Privy auth schema is incomplete; missing tables: ${missingTables.join(', ')}`);
    }
  },

  async down() {
    // Verification-only migration: it does not mutate schema state.
  },
};
