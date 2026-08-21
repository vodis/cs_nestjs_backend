'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('investment_profiles', {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: Sequelize.literal('gen_random_uuid()'),
            },
            user_id: {
                type: Sequelize.UUID,
                allowNull: false,
                unique: true,
                references: { model: 'app_users', key: 'id' },
                onDelete: 'CASCADE',
            },
            objective: { type: Sequelize.STRING, allowNull: false, defaultValue: 'growth' },
            risk_tolerance: { type: Sequelize.STRING, allowNull: false, defaultValue: 'balanced' },
            horizon: { type: Sequelize.STRING, allowNull: false, defaultValue: '3_5y' },
            created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
            updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        });

        await queryInterface.createTable('agent_connections', {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: Sequelize.literal('gen_random_uuid()'),
            },
            user_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: { model: 'app_users', key: 'id' },
                onDelete: 'CASCADE',
            },
            client_id: { type: Sequelize.STRING, allowNull: false },
            client_name: { type: Sequelize.STRING, allowNull: false },
            scopes: { type: Sequelize.JSONB, allowNull: false },
            status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'active' },
            expires_at: { type: Sequelize.DATE, allowNull: false },
            last_used_at: { type: Sequelize.DATE, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
            updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        });
        await queryInterface.addIndex('agent_connections', ['user_id', 'status']);

        await queryInterface.createTable('agent_authorizations', {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: Sequelize.literal('gen_random_uuid()'),
            },
            user_id: {
                type: Sequelize.UUID,
                allowNull: true,
                references: { model: 'app_users', key: 'id' },
                onDelete: 'CASCADE',
            },
            connection_id: {
                type: Sequelize.UUID,
                allowNull: true,
                references: { model: 'agent_connections', key: 'id' },
                onDelete: 'SET NULL',
            },
            client_id: { type: Sequelize.STRING, allowNull: false },
            client_name: { type: Sequelize.STRING, allowNull: false },
            redirect_uri: { type: Sequelize.STRING, allowNull: true },
            state: { type: Sequelize.STRING, allowNull: true },
            resource: { type: Sequelize.STRING, allowNull: false },
            scopes: { type: Sequelize.JSONB, allowNull: false },
            code_challenge: { type: Sequelize.STRING, allowNull: true },
            authorization_code_hash: { type: Sequelize.STRING(64), allowNull: true },
            user_code: { type: Sequelize.STRING(9), allowNull: true, unique: true },
            device_code_hash: { type: Sequelize.STRING(64), allowNull: true, unique: true },
            status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'pending' },
            expires_at: { type: Sequelize.DATE, allowNull: false },
            created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
            updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        });

        await queryInterface.createTable('agent_credentials', {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: Sequelize.literal('gen_random_uuid()'),
            },
            connection_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: { model: 'agent_connections', key: 'id' },
                onDelete: 'CASCADE',
            },
            kind: { type: Sequelize.STRING, allowNull: false },
            token_hash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
            family_id: { type: Sequelize.UUID, allowNull: false },
            expires_at: { type: Sequelize.DATE, allowNull: false },
            used_at: { type: Sequelize.DATE, allowNull: true },
            revoked_at: { type: Sequelize.DATE, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        });
        await queryInterface.addIndex('agent_credentials', ['family_id']);
    },

    async down(queryInterface) {
        await queryInterface.dropTable('agent_credentials');
        await queryInterface.dropTable('agent_authorizations');
        await queryInterface.dropTable('agent_connections');
        await queryInterface.dropTable('investment_profiles');
    },
};
