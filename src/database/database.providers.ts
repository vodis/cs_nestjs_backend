import { Sequelize } from 'sequelize-typescript';
import { ConfigService } from './../shared/config/config.service';

export const databaseProviders = [
    {
        provide: 'SEQUELIZE',
        useFactory: async (configService: ConfigService) => {
            const sequelize = new Sequelize(configService.sequelizeOrmConfig);
            sequelize.addModels([]);
            await sequelize.sync();
            return sequelize;
        },
        inject: [ConfigService],
    },
];
