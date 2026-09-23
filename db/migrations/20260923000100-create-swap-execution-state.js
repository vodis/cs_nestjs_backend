'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('swap_preparations', {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: Sequelize.literal('gen_random_uuid()'),
            },
            provider_id: { type: Sequelize.STRING, allowNull: false },
            execution_mode: { type: Sequelize.STRING, allowNull: false },
            user_address: { type: Sequelize.STRING, allowNull: false },
            user_chain_type: { type: Sequelize.STRING, allowNull: false },
            execution_payload: { type: Sequelize.JSONB, allowNull: false },
            expires_at: { type: Sequelize.DATE, allowNull: false },
            created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        });
        await queryInterface.addIndex('swap_preparations', ['expires_at']);

        await queryInterface.createTable('swap_executions', {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: Sequelize.literal('gen_random_uuid()'),
            },
            preparation_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: { model: 'swap_preparations', key: 'id' },
                onDelete: 'RESTRICT',
            },
            user_id: { type: Sequelize.UUID, allowNull: false },
            idempotency_key: { type: Sequelize.STRING(128), allowNull: false },
            request_fingerprint: { type: Sequelize.STRING(64), allowNull: false },
            provider_id: { type: Sequelize.STRING, allowNull: false },
            trace_id: { type: Sequelize.STRING, allowNull: false },
            status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'pending' },
            intent_hash: { type: Sequelize.STRING, allowNull: true },
            failure_code: { type: Sequelize.STRING, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
            updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        });
        await queryInterface.addIndex('swap_executions', ['user_id', 'idempotency_key'], {
            unique: true,
            name: 'swap_executions_user_idempotency_unique',
        });
        await queryInterface.addIndex('swap_executions', ['user_id', 'request_fingerprint'], {
            unique: true,
            name: 'swap_executions_user_fingerprint_unique',
        });
        await queryInterface.addIndex('swap_executions', ['preparation_id']);
    },

    async down(queryInterface) {
        await queryInterface.dropTable('swap_executions');
        await queryInterface.dropTable('swap_preparations');
    },
};
