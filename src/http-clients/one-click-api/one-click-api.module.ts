import { Module, OnModuleInit } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { onHttpModuleInit } from '../http-clients.interceptor';
import { OneClickApiHttpClient } from './one-click-api.http-client';

@Module({
    imports: [
        HttpModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                baseURL: configService.get('ONE_CLICK_API_URL') || 'https://1click.chaindefuser.com',
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 5000,
            }),
            inject: [ConfigService],
        }),
    ],
    providers: [OneClickApiHttpClient],
    exports: [OneClickApiHttpClient],
})
export class OneClickApiModule implements OnModuleInit {
    constructor(private readonly httpService: HttpService) {}

    onModuleInit = () => onHttpModuleInit(this.httpService);
}
