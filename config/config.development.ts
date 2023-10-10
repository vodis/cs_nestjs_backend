import { Dialect } from 'sequelize/types';

export const config = {
    database: {
        dialect: 'postgres' as Dialect,
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        logging: Boolean(process.env.DB_LOGGING),
        dialectOptions: {
            bigNumberStrings: true,
            autoJsonMap: false,
        },
        seederStorage: 'sequelize',
        pool: {
            max: 50,
            min: 0,
            idle: 10000,
            acquire: 30000,
            evict: 5000,
        },
    },
};
