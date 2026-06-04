import { Module } from '@nestjs/common';
import { I18nServiceApiModule } from './i18n-api/i18n-service-api.module';
import { OneClickApiModule } from './one-click-api/one-click-api.module';

@Module({
    imports: [I18nServiceApiModule, OneClickApiModule],
    exports: [I18nServiceApiModule, OneClickApiModule],
})
export class HttpClientsModule {}
