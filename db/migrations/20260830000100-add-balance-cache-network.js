'use strict';

/**
 * Business reason: distinguish balances for the same wallet and asset across
 * CAIP-2 networks so resilient multi-network RPC reads cannot overwrite one
 * another.
 *
 * Safety: this is the expand/application-transition release. The column stays
 * nullable and the legacy unique index remains in place so the active and
 * rollback application versions can continue upserting rows without network.
 * The new network-aware index is added alongside it for this application.
 *
 * Contract follow-up: only after every active and retained rollback image
 * writes network, backfill again, make network required, and remove the legacy
 * unique index in a separately approved release. Until then, the legacy index
 * intentionally prevents storing the same wallet/asset pair on two networks.
 *
 * Rollback mitigation: the previous application image remains compatible with
 * this expanded schema. If this migration itself must be reverted, deploy the
 * previous image before running down.
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
        await queryInterface.addIndex('balance_cache_entries', ['user_id', 'wallet_id', 'network', 'asset_id'], {
            unique: true,
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeIndex('balance_cache_entries', ['user_id', 'wallet_id', 'network', 'asset_id']);
        await queryInterface.removeColumn('balance_cache_entries', 'network');
    },
};
