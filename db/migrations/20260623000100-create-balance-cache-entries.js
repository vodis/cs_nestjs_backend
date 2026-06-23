'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    await queryInterface.createTable('balance_cache_entries', {
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
      wallet_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'wallet_links', key: 'id' },
        onDelete: 'CASCADE',
      },
      wallet_address: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      chain_type: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      asset_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      symbol: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      decimals: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      balance_raw: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '0',
      },
      balance_decimal: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      source: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'postgres_cache',
      },
      fetched_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
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

    await queryInterface.addIndex('balance_cache_entries', ['user_id']);
    await queryInterface.addIndex('balance_cache_entries', ['wallet_id']);
    await queryInterface.addIndex('balance_cache_entries', ['expires_at']);
    await queryInterface.addIndex('balance_cache_entries', ['user_id', 'wallet_id', 'asset_id'], { unique: true });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('balance_cache_entries');
  },
};
