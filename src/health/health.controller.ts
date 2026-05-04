import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
    constructor(private readonly healthService: HealthService) {}

    @Get()
    async getHealth() {
        const [database, redis] = await Promise.all([
            this.healthService.checkDatabase(),
            this.healthService.checkRedis(),
        ]);

        const status = database.status === 'ok' && redis.status === 'ok' ? 'ok' : 'degraded';

        return {
            status,
            services: {
                database,
                redis,
            },
            timestamp: new Date().toISOString(),
        };
    }
}
