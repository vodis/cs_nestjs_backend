import { Module } from '@nestjs/common';
import { TranslationsController } from './translations.controller';
import { TranslationsService } from './translations.service';
import { I18nServiceApiModule } from '@http-clients/i18n-api/i18n-service-api.module';

@Module({
    imports: [I18nServiceApiModule],
    controllers: [TranslationsController],
    providers: [TranslationsService],
})
export class TranslationsModule {}
