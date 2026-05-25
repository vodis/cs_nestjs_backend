import { Injectable } from '@nestjs/common';
import { I18nServiceApiHttpClient } from '@http-clients/i18n-api/i18n-service-api.http-client';
import { ConfigService } from '@nestjs/config';
import { GetLanguageRequestsDto } from './dto/responses/get-language-requests.dto';

@Injectable()
export class TranslationsService {
    constructor(
        private configService: ConfigService,
        private i18nServiceApiHttpClient: I18nServiceApiHttpClient,
    ) {}

    async getLanguage(language: string, system: string = 'cs-main'): Promise<GetLanguageRequestsDto> {
        const languages = await this.i18nServiceApiHttpClient.getLanguages(system);
        const checkLanguage = languages.some(
            ({ language: availableLanguage }) => availableLanguage.toUpperCase() === language.toUpperCase(),
        );

        let translations;
        if (checkLanguage) {
            translations = await this.i18nServiceApiHttpClient.getTranslations(language, system);
        } else {
            translations = await this.i18nServiceApiHttpClient.getTranslations(
                this.configService.getOrThrow('DEFAULT_LANGUAGE') || 'en',
                system,
            );
        }

        return {
            languages: languages.reduce((result, { language, label }) => {
                Object.assign(result, {
                    [language]: {
                        language,
                        title: label,
                    },
                });
                return result;
            }, {}),
            translations,
        };
    }
}
