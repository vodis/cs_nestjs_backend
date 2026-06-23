'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('wallet_links', 'source', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'privy',
    });
    await queryInterface.addColumn('wallet_links', 'status', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'active',
    });
    await queryInterface.addColumn('wallet_links', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addIndex('wallet_links', ['user_id', 'status']);
    await queryInterface.addIndex('wallet_links', ['deleted_at']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('wallet_links', ['deleted_at']);
    await queryInterface.removeIndex('wallet_links', ['user_id', 'status']);
    await queryInterface.removeColumn('wallet_links', 'deleted_at');
    await queryInterface.removeColumn('wallet_links', 'status');
    await queryInterface.removeColumn('wallet_links', 'source');
  },
};
