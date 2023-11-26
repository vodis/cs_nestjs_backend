import { Controller, Get, Param } from '@nestjs/common';
import { TranslationsService } from './translations.service';
import { GetLanguageRequestsDto } from './dto/get-language-requests.dto';

@Controller({ version: '1', path: 'translations' })
export class TranslationsController {
    constructor(private readonly i18nService: TranslationsService) {}

    @Get('/:language')
    async getLanguageRequests(@Param('language') language: string): Promise<GetLanguageRequestsDto> {
        const result = await this.i18nService.getLanguage(language);
        return result;
    }
}
