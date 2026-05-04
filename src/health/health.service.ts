import { Injectable } from '@nestjs/common';
import { Client as PgClient } from 'pg';
import { Socket } from 'net';

type HealthStatus = 'ok' | 'error';

interface DependencyHealth {
    status: HealthStatus;
    details?: string;
}

@Injectable()
export class HealthService {
    async checkDatabase(): Promise<DependencyHealth> {
        const client = new PgClient({
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT || 5432),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            connectionTimeoutMillis: 1500,
        });

        try {
            await client.connect();
            await client.query('SELECT 1');
            return { status: 'ok' };
        } catch (error) {
            return { status: 'error', details: this.getErrorMessage(error) };
        } finally {
            await client.end().catch(() => undefined);
        }
    }

    async checkRedis(): Promise<DependencyHealth> {
        const host = process.env.REDIS_HOST || '127.0.0.1';
        const port = Number(process.env.REDIS_PORT || 6379);

        return new Promise((resolve) => {
            const socket = new Socket();
            let settled = false;

            const done = (result: DependencyHealth): void => {
                if (!settled) {
                    settled = true;
                    socket.destroy();
                    resolve(result);
                }
            };

            socket.setTimeout(1500);
            socket.once('connect', () => done({ status: 'ok' }));
            socket.once('timeout', () => done({ status: 'error', details: 'Connection timeout' }));
            socket.once('error', (error) => done({ status: 'error', details: this.getErrorMessage(error) }));
            socket.connect(port, host);
        });
    }

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        return 'Unknown error';
    }
}
