import { Module, OnModuleInit } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { onHttpModuleInit } from '../http-clients.interceptor';
import { NearRpcApiHttpClient } from './near-rpc-api.http-client';

@Module({
    imports: [
        HttpModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                baseURL: configService.get('NEAR_RPC_URL') || 'https://rpc.mainnet.near.org',
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: Number(configService.get('NEAR_RPC_TIMEOUT_MS') || 5000),
            }),
            inject: [ConfigService],
        }),
    ],
    providers: [NearRpcApiHttpClient],
    exports: [NearRpcApiHttpClient],
})
export class NearRpcApiModule implements OnModuleInit {
    constructor(private readonly httpService: HttpService) {}

    onModuleInit = () => onHttpModuleInit(this.httpService);
}
