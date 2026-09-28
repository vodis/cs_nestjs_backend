'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('wallet_links', 'ownership_verified_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.createTable('wallet_link_challenges', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'app_users', key: 'id' }, onDelete: 'CASCADE' },
      address: { type: Sequelize.STRING, allowNull: false },
      chain_type: { type: Sequelize.STRING, allowNull: false },
      nonce: { type: Sequelize.STRING, allowNull: false },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      consumed_at: { type: Sequelize.DATE, allowNull: true },
      proof_fingerprint: { type: Sequelize.STRING(64), allowNull: true },
      wallet_link_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'wallet_links', key: 'id' }, onDelete: 'SET NULL' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('wallet_link_challenges', ['user_id', 'expires_at']);
    await queryInterface.addIndex('wallet_link_challenges', ['expires_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('wallet_link_challenges');
    await queryInterface.removeColumn('wallet_links', 'ownership_verified_at');
  },
};
