import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { OneClickTokenDto } from './dto/one-click-token.dto';
import { ConfigService } from '@nestjs/config';

export type OneClickQuoteRequest = {
    dry: boolean;
    swapType: 'EXACT_INPUT' | 'EXACT_OUTPUT';
    slippageTolerance: number;
    originAsset: string;
    depositType: 'ORIGIN_CHAIN' | 'INTENTS';
    destinationAsset: string;
    amount: string;
    recipient: string;
    recipientType: 'DESTINATION_CHAIN' | 'INTENTS';
    refundTo: string;
    refundType: 'ORIGIN_CHAIN' | 'INTENTS';
    deadline: string;
    isConfidential?: boolean;
};

@Injectable()
export class OneClickApiHttpClient {
    constructor(
        private readonly httpServer: HttpService,
        private readonly configService: ConfigService,
    ) {}

    async getTokens(): Promise<OneClickTokenDto[]> {
        const { data } = await this.httpServer.axiosRef.get('v0/tokens');
        return data;
    }

    async createQuote(payload: OneClickQuoteRequest): Promise<unknown> {
        const token = this.configService.get<string>('ONE_CLICK_API_JWT');
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const { data } = await this.httpServer.axiosRef.post('v0/quote', payload, { headers });
        return data;
    }
}
