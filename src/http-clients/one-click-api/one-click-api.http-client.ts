import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { OneClickTokenDto } from './dto/one-click-token.dto';

@Injectable()
export class OneClickApiHttpClient {
    constructor(private readonly httpServer: HttpService) {}

    async getTokens(): Promise<OneClickTokenDto[]> {
        const { data } = await this.httpServer.axiosRef.get('v0/tokens');
        return data;
    }
}
