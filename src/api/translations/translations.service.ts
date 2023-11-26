import { Injectable } from '@nestjs/common';
import { GetLanguageDto } from './dto/get-language.dto';
import { I18nServiceApiHttpClient } from '@http-clients/i18n-api/i18n-service-api.http-client';

@Injectable()
export class TranslationsService {
    constructor(private i18nServiceApiHttpClient: I18nServiceApiHttpClient) {}

    async getLanguage(language: string): Promise<GetLanguageDto> {
        console.log(language, 'language');
        const translations: any = await this.i18nServiceApiHttpClient.getTranslations(language);
        console.log(translations, 'translations');
        return true;
    }
}
