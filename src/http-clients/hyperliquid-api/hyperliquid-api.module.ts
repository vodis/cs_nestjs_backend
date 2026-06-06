import { Module, OnModuleInit } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { onHttpModuleInit } from '../http-clients.interceptor';
import { HyperliquidApiHttpClient } from './hyperliquid-api.http-client';

@Module({
    imports: [
        HttpModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                baseURL: configService.get('HYPERLIQUID_API_URL') || 'https://api.hyperliquid.xyz',
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 5000,
            }),
            inject: [ConfigService],
        }),
    ],
    providers: [HyperliquidApiHttpClient],
    exports: [HyperliquidApiHttpClient],
})
export class HyperliquidApiModule implements OnModuleInit {
    constructor(private readonly httpService: HttpService) {}

    onModuleInit = () => onHttpModuleInit(this.httpService);
}
