'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('app_users', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('app_users', 'deletion_requested_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('app_users', 'deletion_available_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addIndex('app_users', ['status']);
    await queryInterface.addIndex('app_users', ['deletion_available_at']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('app_users', ['deletion_available_at']);
    await queryInterface.removeIndex('app_users', ['status']);
    await queryInterface.removeColumn('app_users', 'deletion_available_at');
    await queryInterface.removeColumn('app_users', 'deletion_requested_at');
    await queryInterface.removeColumn('app_users', 'deleted_at');
  },
};
