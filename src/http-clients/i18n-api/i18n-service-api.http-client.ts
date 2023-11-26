import { Injectable, UseInterceptors } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { HttpServiceInterceptor } from '../http-clients.interceptor';
import { GetTranslationsDto } from './dto/get-translations.dto';

@Injectable()
@UseInterceptors(HttpServiceInterceptor)
export class I18nServiceApiHttpClient {
    constructor(private readonly httpServer: HttpService) {}

    async getTranslations(language: string, system: string = 'cs-main'): Promise<GetTranslationsDto[]> {
        const { data } = await this.httpServer.axiosRef.get(`translations/${system}/translation/${language}`);
        return data;
    }
}
