'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('product_events', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      event_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      source: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      anonymous_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      session_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      request_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      reason_code: {
        type: Sequelize.STRING,
        allowNull: true,
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

    await queryInterface.addIndex('product_events', ['event_name', 'created_at']);
    await queryInterface.addIndex('product_events', ['source', 'created_at']);
    await queryInterface.addIndex('product_events', ['status', 'created_at']);
    await queryInterface.addIndex('product_events', ['user_id', 'created_at']);
    await queryInterface.addIndex('product_events', ['session_id', 'created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('product_events');
  },
};
