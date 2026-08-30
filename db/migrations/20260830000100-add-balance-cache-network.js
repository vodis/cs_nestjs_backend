'use strict';

/**
 * Business reason: distinguish balances for the same wallet and asset across
 * CAIP-2 networks so resilient multi-network RPC reads cannot overwrite one
 * another.
 *
 * Safety: the column is expanded as nullable, backfilled from the legacy
 * chain_type, then made required before the unique index changes. Existing
 * application versions ignore the additive column during blue/green rollout.
 *
 * Rollback mitigation: deploy the previous application image first. The down
 * migration can restore the old unique key only when no wallet has duplicate
 * asset rows across networks; otherwise retain the additive column and roll
 * forward after reconciling those rows.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('balance_cache_entries', 'network', {
            type: Sequelize.STRING,
            allowNull: true,
        });
        await queryInterface.sequelize.query(`
      UPDATE balance_cache_entries
      SET network = CASE
        WHEN chain_type = 'near' THEN 'near:mainnet'
        WHEN chain_type IN ('ethereum', 'evm') THEN 'eip155:1'
        ELSE chain_type
      END
      WHERE network IS NULL
    `);
        await queryInterface.changeColumn('balance_cache_entries', 'network', {
            type: Sequelize.STRING,
            allowNull: false,
        });
        await queryInterface.removeIndex('balance_cache_entries', ['user_id', 'wallet_id', 'asset_id']);
        await queryInterface.addIndex('balance_cache_entries', ['user_id', 'wallet_id', 'network', 'asset_id'], {
            unique: true,
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeIndex('balance_cache_entries', ['user_id', 'wallet_id', 'network', 'asset_id']);
        await queryInterface.addIndex('balance_cache_entries', ['user_id', 'wallet_id', 'asset_id'], { unique: true });
        await queryInterface.removeColumn('balance_cache_entries', 'network');
    },
};
