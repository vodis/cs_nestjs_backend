import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { isAxiosError } from 'axios';
import type { AxiosResponse } from 'axios';
import { OneClickTokenDto } from './dto/one-click-token.dto';
import { ConfigService } from '@nestjs/config';
import type { OneClickSwapStatus } from '../../modules/swaps/domain/models/swap-settlement-status';

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

@Injectable()
export class OneClickApiHttpClient {
    constructor(
        private readonly httpServer: HttpService,
        private readonly configService: ConfigService,
    ) {}

    async getTokens(): Promise<OneClickTokenDto[]> {
        return this.safeResponse(this.httpServer.axiosRef.get('v0/tokens'));
    }

    async createQuote(payload: OneClickQuoteRequest): Promise<unknown> {
        return this.safeResponse(
            this.httpServer.axiosRef.post('v0/quote', payload, { headers: this.authHeaders() }),
            'quote',
        );
    }

    async generateIntent(payload: OneClickGenerateIntentRequest): Promise<OneClickGenerateIntentResponse> {
        return this.safeResponse(
            this.httpServer.axiosRef.post<OneClickGenerateIntentResponse>('v0/generate-intent', payload, {
                headers: this.authHeaders(),
            }),
        );
    }

    async submitIntent(payload: OneClickSubmitIntentRequest): Promise<OneClickSubmitIntentResponse> {
        return this.safeResponse(
            this.httpServer.axiosRef.post<OneClickSubmitIntentResponse>('v0/submit-intent', payload, {
                headers: this.authHeaders(),
            }),
            'submit',
        );
    }

    async getSwapStatus(depositAddress: string, depositMemo?: string): Promise<{ status: OneClickSwapStatus }> {
        return this.safeResponse(
            this.httpServer.axiosRef.get<{ status: OneClickSwapStatus }>('v0/status', {
                headers: this.authHeaders(),
                params: { depositAddress, ...(depositMemo ? { depositMemo } : {}) },
            }),
        );
    }

    private async safeResponse<T>(request: Promise<AxiosResponse<T>>, rejection?: 'quote' | 'submit'): Promise<T> {
        try {
            const { data } = await request;
            return data;
        } catch (error) {
            // Axios errors contain authorization headers and signed request bodies.
            if (
                isAxiosError(error) &&
                error.response &&
                rejection === 'quote' &&
                error.response.status >= 400 &&
                error.response.status < 500
            ) {
                throw new BadRequestException(error.response.data);
            }
            if (isAxiosError(error) && error.response?.status === 400 && rejection === 'submit') {
                throw new BadRequestException({
                    code: 'ONE_CLICK_SUBMISSION_REJECTED',
                    message: '1Click rejected the signed intent',
                });
            }
            throw new BadGatewayException({
                code: 'ONE_CLICK_UPSTREAM_ERROR',
                message: '1Click request failed',
            });
        }
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
