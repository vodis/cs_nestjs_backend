import { Module, OnModuleInit } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { onHttpModuleInit } from '../http-clients.interceptor';
import { SolverRelayApiHttpClient } from './solver-relay-api.http-client';

@Module({
    imports: [
        HttpModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                baseURL:
                    configService.get('SOLVER_RELAY_API_URL') || 'https://solver-relay-v2.chaindefuser.com',
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: Number(configService.get('SOLVER_RELAY_TIMEOUT_MS') || 5000),
            }),
            inject: [ConfigService],
        }),
    ],
    providers: [SolverRelayApiHttpClient],
    exports: [SolverRelayApiHttpClient],
})
export class SolverRelayApiModule implements OnModuleInit {
    constructor(private readonly httpService: HttpService) {}

    onModuleInit = () => onHttpModuleInit(this.httpService);
}
