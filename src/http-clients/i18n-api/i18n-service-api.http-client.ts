import { Injectable, UseInterceptors } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { HttpServiceInterceptor } from '../http-clients.interceptor';
import { GetTranslationsDto } from './dto/get-translations.dto';
import { GetLanguagesDto } from './dto/get-languages.dto';

@Injectable()
@UseInterceptors(HttpServiceInterceptor)
export class I18nServiceApiHttpClient {
    constructor(private readonly httpServer: HttpService) {}

    async getTranslations(language: string, system: string): Promise<GetTranslationsDto[]> {
        const { data } = await this.httpServer.axiosRef.get(`translations/${system}/translation/${language}`);
        return data;
    }

    async getLanguages(system: string): Promise<GetLanguagesDto[]> {
        const { data } = await this.httpServer.axiosRef.get(`${system}/languages`);
        return data;
    }
}
