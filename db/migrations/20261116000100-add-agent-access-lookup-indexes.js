'use strict';

/**
 * Business reason: authorization codes are looked up by hash on every
 * /oauth/token exchange, and connection revocation updates every credential of
 * a connection by connection_id. Neither column was indexed, so both paths
 * scan the whole table as agent usage grows. The unique index also makes
 * authorization-code single use a database-enforced invariant.
 *
 * Safety: additive only. authorization_code_hash is a 256-bit random value
 * that is nulled once consumed, and NULLs never conflict, so existing rows
 * satisfy the unique index. The previous application image is unaffected.
 *
 * Rollback mitigation: down drops both indexes; no data is touched.
 */
const CODE_HASH_INDEX = 'agent_authorizations_authorization_code_hash_unique';
const CONNECTION_INDEX = 'agent_credentials_connection_id';

module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.addIndex('agent_authorizations', ['authorization_code_hash'], {
                name: CODE_HASH_INDEX,
                unique: true,
                transaction,
            });
            await queryInterface.addIndex('agent_credentials', ['connection_id'], {
                name: CONNECTION_INDEX,
                transaction,
            });
        });
    },

    async down(queryInterface) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.removeIndex('agent_credentials', CONNECTION_INDEX, { transaction });
            await queryInterface.removeIndex('agent_authorizations', CODE_HASH_INDEX, { transaction });
        });
    },
};
