import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { OneClickTokenDto } from './dto/one-click-token.dto';
import { ConfigService } from '@nestjs/config';

export type OneClickQuoteRequest = {
    dry: boolean;
    swapType: 'EXACT_INPUT' | 'EXACT_OUTPUT';
    slippageTolerance: number;
    originAsset: string;
    depositType: 'ORIGIN_CHAIN' | 'INTENTS' | 'CONFIDENTIAL_INTENTS';
    destinationAsset: string;
    amount: string;
    recipient: string;
    recipientType: 'DESTINATION_CHAIN' | 'INTENTS' | 'CONFIDENTIAL_INTENTS';
    refundTo: string;
    refundType: 'ORIGIN_CHAIN' | 'INTENTS' | 'CONFIDENTIAL_INTENTS';
    deadline: string;
};

export type OneClickIntentStandard = 'nep413' | 'erc191';

export type OneClickGenerateIntentRequest = {
    type: 'swap_transfer';
    standard: OneClickIntentStandard;
    signerId: string;
    depositAddress: string;
};

export type OneClickGenerateIntentResponse = {
    intent: Record<string, unknown>;
    correlationId: string;
};

export type OneClickSubmitIntentRequest = {
    type: 'swap_transfer';
    signedData: Record<string, unknown>;
};

export type OneClickSubmitIntentResponse = {
    intentHash: string;
    correlationId: string;
};

export type OneClickSwapStatus =
    'KNOWN_DEPOSIT_TX' | 'PENDING_DEPOSIT' | 'INCOMPLETE_DEPOSIT' | 'PROCESSING' | 'SUCCESS' | 'REFUNDED' | 'FAILED';

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
        const { data } = await this.httpServer.axiosRef.post('v0/quote', payload, { headers: this.authHeaders() });
        return data;
    }

    async generateIntent(payload: OneClickGenerateIntentRequest): Promise<OneClickGenerateIntentResponse> {
        const { data } = await this.httpServer.axiosRef.post<OneClickGenerateIntentResponse>(
            'v0/generate-intent',
            payload,
            {
                headers: this.authHeaders(),
            },
        );
        return data;
    }

    async submitIntent(payload: OneClickSubmitIntentRequest): Promise<OneClickSubmitIntentResponse> {
        const { data } = await this.httpServer.axiosRef.post<OneClickSubmitIntentResponse>(
            'v0/submit-intent',
            payload,
            {
                headers: this.authHeaders(),
            },
        );
        return data;
    }

    async getSwapStatus(depositAddress: string, depositMemo?: string): Promise<{ status: OneClickSwapStatus }> {
        const { data } = await this.httpServer.axiosRef.get<{ status: OneClickSwapStatus }>('v0/status', {
            headers: this.authHeaders(),
            params: { depositAddress, ...(depositMemo ? { depositMemo } : {}) },
        });
        return data;
    }

    private authHeaders(): Record<string, string> | undefined {
        const apiKey = this.configService.get<string>('ONE_CLICK_API_KEY');
        if (apiKey) {
            return { 'X-API-Key': apiKey };
        }

        const jwt = this.configService.get<string>('ONE_CLICK_API_JWT');
        return jwt ? { Authorization: `Bearer ${jwt}` } : undefined;
    }
}
