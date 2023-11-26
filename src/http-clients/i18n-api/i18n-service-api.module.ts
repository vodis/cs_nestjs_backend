import { Module, OnModuleInit } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { HttpServiceInterceptorProvider, onHttpModuleInit } from '../http-clients.interceptor';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { I18nServiceApiHttpClient } from './i18n-service-api.http-client';

@Module({
    imports: [
        HttpModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                baseURL: configService.getOrThrow('CS_I18N_SERVICE_URL'),
                headers: {
                    'Content-Type': 'application/json',
                },
            }),
            inject: [ConfigService],
        }),
    ],
    providers: [HttpServiceInterceptorProvider, I18nServiceApiHttpClient],
    exports: [I18nServiceApiHttpClient],
})
export class I18nServiceApiModule implements OnModuleInit {
    constructor(private readonly httpService: HttpService) {}

    onModuleInit = () => onHttpModuleInit(this.httpService);
}
