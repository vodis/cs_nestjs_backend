'use strict';

/**
 * Business reason: browser OAuth clients are now identified through their
 * Client ID Metadata Document. The consent screen needs the verified client
 * homepage, logo and how the identity was established, captured when the
 * authorization request is created.
 *
 * Safety: additive, nullable columns only. Authorization rows live for ten
 * minutes; rows written by the previous image read as "unverified". The
 * previous image ignores the new columns.
 *
 * Rollback mitigation: down removes the three columns; only display metadata
 * of in-flight authorization requests is lost.
 */
const COLUMNS = ['client_uri', 'logo_uri', 'client_verification'];

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.addColumn(
                'agent_authorizations',
                'client_uri',
                { type: Sequelize.STRING(2048), allowNull: true },
                { transaction },
            );
            await queryInterface.addColumn(
                'agent_authorizations',
                'logo_uri',
                { type: Sequelize.STRING(2048), allowNull: true },
                { transaction },
            );
            await queryInterface.addColumn(
                'agent_authorizations',
                'client_verification',
                { type: Sequelize.STRING(32), allowNull: true },
                { transaction },
            );
        });
    },

    async down(queryInterface) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            for (const column of [...COLUMNS].reverse()) {
                await queryInterface.removeColumn('agent_authorizations', column, { transaction });
            }
        });
    },
};
