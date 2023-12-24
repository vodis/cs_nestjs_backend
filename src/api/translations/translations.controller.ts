import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { TranslationsService } from './translations.service';
import { GetLanguageRequestsDto } from './dto/responses/get-language-requests.dto';
import { ApiResponse, ApiParam } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Controller({ version: '1', path: 'translations' })
export class TranslationsController {
    constructor(
        private configService: ConfigService,
        private readonly i18nService: TranslationsService,
    ) {}

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
        @Req() req: Request,
        @Param('language') language: string,
        @Query('system') system?: string,
        @Res({ passthrough: true }) res?: Response,
    ): Promise<GetLanguageRequestsDto> {
        try {
            res.cookie('active-language', language, {
                sameSite: 'lax',
                // domain: this.configService.getOrThrow('COOKIES_DOMAIN'),
            });
            return await this.i18nService.getLanguage(language, system);
        } catch (e) {
            throw e;
        }
    }
}
