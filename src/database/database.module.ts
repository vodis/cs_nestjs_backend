import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Sequelize } from 'sequelize-typescript';
import { AppUser } from './models/app-user.model';
import { AuthAuditEvent } from './models/auth-audit-event.model';
import { WalletLink } from './models/wallet-link.model';
import { SEQUELIZE } from './database.tokens';

const models = [AppUser, WalletLink, AuthAuditEvent];

function databaseUrl(config: ConfigService): string | undefined {
    return config.get<string>('DATABASE_URL') || process.env.DATABASE_URL;
}

function createSequelize(config: ConfigService): Sequelize {
    const url = databaseUrl(config);
    const logging = config.get<string>('DB_LOGGING') === 'true' ? console.log : false;

    if (url) {
        return new Sequelize(url, {
            dialect: 'postgres',
            logging,
            models,
        });
    }

    const dialect = config.get<string>('DB_CLIENT') || 'postgres';
    return new Sequelize({
        dialect: dialect as 'postgres' | 'sqlite',
        host: config.get<string>('DB_HOST') || 'localhost',
        port: Number(config.get<string>('DB_PORT') || 5432),
        database: config.get<string>('DB_NAME') || 'craftscript',
        username: config.get<string>('DB_USER') || 'postgres',
        password: config.get<string>('DB_PASSWORD') || undefined,
        storage: dialect === 'sqlite' ? ':memory:' : undefined,
        logging,
        models,
    });
}

@Module({
    providers: [
        {
            provide: SEQUELIZE,
            inject: [ConfigService],
            useFactory: createSequelize,
        },
    ],
    exports: [SEQUELIZE],
})
export class DatabaseModule {}
