import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

type JsonRpcResponse<T> = {
    jsonrpc: string;
    id: string;
    result?: T;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
};

export type NearViewAccountResult = {
    amount: string;
};

@Injectable()
export class NearRpcApiHttpClient {
    constructor(private readonly httpService: HttpService) {}

    async viewAccount(accountId: string): Promise<NearViewAccountResult | undefined> {
        const { data } = await this.httpService.axiosRef.post<JsonRpcResponse<NearViewAccountResult>>('', {
            jsonrpc: '2.0',
            id: 'view-account',
            method: 'query',
            params: {
                request_type: 'view_account',
                finality: 'final',
                account_id: accountId,
            },
        });

        if (data.error) {
            throw new Error(data.error.message || 'NEAR RPC query failed');
        }

        return data.result;
    }
}
