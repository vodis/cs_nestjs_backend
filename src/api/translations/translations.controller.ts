import { Controller, Get, Param, Query } from '@nestjs/common';
import { TranslationsService } from './translations.service';
import { GetLanguageRequestsDto } from './dto/responses/get-language-requests.dto';
import { ApiResponse, ApiParam } from '@nestjs/swagger';

@Controller({ version: '1', path: 'translations' })
export class TranslationsController {
    constructor(private readonly i18nService: TranslationsService) {}

    @Get('/:language')
    @ApiParam({
        name: 'system',
        description: 'Optional system parameter',
        required: false,
    })
    @ApiResponse({
        status: 200,
        description: 'Get Languages Requests',
        type: GetLanguageRequestsDto,
    })
    async getLanguageRequests(
        @Param('language') language: string,
        @Query('system') system?: string,
    ): Promise<GetLanguageRequestsDto> {
        return await this.i18nService.getLanguage(language, system);
    }
}
