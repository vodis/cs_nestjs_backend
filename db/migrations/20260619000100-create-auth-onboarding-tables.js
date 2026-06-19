'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    await queryInterface.createTable('app_users', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      privy_user_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      email: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      auth_method: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'active',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.createTable('wallet_links', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'app_users', key: 'id' },
        onDelete: 'CASCADE',
      },
      privy_wallet_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      address: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      chain_type: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'ethereum',
      },
      wallet_type: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'embedded',
      },
      is_primary: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('wallet_links', ['user_id']);
    await queryInterface.addIndex('wallet_links', ['address']);
    await queryInterface.addIndex('wallet_links', ['privy_wallet_id']);
    await queryInterface.addIndex('wallet_links', ['user_id', 'address'], { unique: true });

    await queryInterface.createTable('auth_audit_events', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      privy_user_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      event_type: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('auth_audit_events', ['user_id']);
    await queryInterface.addIndex('auth_audit_events', ['privy_user_id']);
    await queryInterface.addIndex('auth_audit_events', ['event_type']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('auth_audit_events');
    await queryInterface.dropTable('wallet_links');
    await queryInterface.dropTable('app_users');
  },
};
