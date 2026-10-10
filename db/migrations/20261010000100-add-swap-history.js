'use strict';
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            for (const [name, type] of [
                ['user_id', Sequelize.UUID],
                ['history_data', Sequelize.JSONB],
                ['attempt_started_at', Sequelize.DATE],
            ]) {
                await queryInterface.addColumn('swap_preparations', name, { type, allowNull: true }, { transaction });
            }
            await queryInterface.addIndex('swap_preparations', ['user_id', 'created_at'], {
                name: 'swap_history_user_created',
                transaction,
            });
        });
    },
    async down(queryInterface) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.removeIndex('swap_preparations', 'swap_history_user_created', { transaction });
            for (const name of ['attempt_started_at', 'history_data', 'user_id'])
                await queryInterface.removeColumn('swap_preparations', name, { transaction });
        });
    },
};
