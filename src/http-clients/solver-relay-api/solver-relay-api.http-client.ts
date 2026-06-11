import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

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

@Injectable()
export class SolverRelayApiHttpClient {
    constructor(private readonly httpService: HttpService) {}

    async requestQuotes(params: SolverQuoteRequest): Promise<SolverQuoteResult[]> {
        const { data } = await this.httpService.axiosRef.post<JsonRpcResponse<SolverQuoteResult[]>>('rpc', {
            jsonrpc: '2.0',
            id: 1,
            method: 'quote',
            params: [params],
        });

        if (data.error) {
            throw new Error(data.error.message || 'Solver relay quote request failed');
        }

        return Array.isArray(data.result) ? data.result : [];
    }
}
