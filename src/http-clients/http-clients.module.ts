import { Module } from '@nestjs/common';
import { I18nServiceApiModule } from './i18n-api/i18n-service-api.module';

@Module({
    imports: [I18nServiceApiModule],
    exports: [I18nServiceApiModule],
})
export class HttpClientsModule {}
