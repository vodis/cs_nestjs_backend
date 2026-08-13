import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

export type SolverQuoteRequest = {
    defuse_asset_identifier_in: string;
    defuse_asset_identifier_out: string;
    exact_amount_in?: string;
    exact_amount_out?: string;
    min_deadline_ms?: number;
};

export type SolverQuoteResult = {
    quote_hash: string;
    defuse_asset_identifier_in: string;
    defuse_asset_identifier_out: string;
    amount_in: string;
    amount_out: string;
    expiration_time: string;
};

type JsonRpcResponse<T> = {
    jsonrpc: string;
    id: number;
    result?: T;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
};

export type SolverRelaySignedData = Record<string, unknown>;

export type PublishIntentResult = {
    status: string;
    intent_hash: string;
};

@Injectable()
export class SolverRelayApiHttpClient {
    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {}

    async requestQuotes(params: SolverQuoteRequest): Promise<SolverQuoteResult[]> {
        const { data } = await this.httpService.axiosRef.post<JsonRpcResponse<SolverQuoteResult[]>>(
            'rpc',
            {
                jsonrpc: '2.0',
                id: 1,
                method: 'quote',
                params: [params],
            },
            this.authOptions(),
        );

        if (data.error) {
            throw new Error(data.error.message || 'Solver relay quote request failed');
        }

        return Array.isArray(data.result) ? data.result : [];
    }

    async publishIntent(params: {
        quoteHashes: string[];
        signedData: SolverRelaySignedData;
    }): Promise<PublishIntentResult> {
        const { data } = await this.httpService.axiosRef.post<JsonRpcResponse<PublishIntentResult>>(
            'rpc',
            {
                jsonrpc: '2.0',
                id: 1,
                method: 'publish_intent',
                params: [
                    {
                        quote_hashes: params.quoteHashes,
                        signed_data: params.signedData,
                    },
                ],
            },
            this.authOptions(),
        );

        if (data.error || !data.result?.intent_hash) {
            throw new Error(data.error?.message || 'Solver relay publish_intent failed');
        }

        return data.result;
    }

    private authOptions(): { headers?: Record<string, string> } {
        const apiKey = this.configService.get<string>('SOLVER_RELAY_API_KEY');

        return apiKey
            ? {
                  headers: {
                      'X-API-Key': apiKey,
                  },
              }
            : {};
    }
}
