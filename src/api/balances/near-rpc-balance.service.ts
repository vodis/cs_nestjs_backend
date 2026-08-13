import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const NEAR_DECIMALS = 24;
const NEAR_NATIVE_ASSET_ID = 'near:native';

type NearRpcResponse<T> = {
    jsonrpc: string;
    id: string;
    result?: T;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
};

type ViewAccountResult = {
    amount: string;
};

export type NearNativeBalance = {
    assetId: string;
    symbol: string;
    decimals: number;
    balanceRaw: string;
    balanceDecimal: string;
    fetchedAt: Date;
    expiresAt: Date;
};

@Injectable()
export class NearRpcBalanceService {
    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {}

    async getNativeBalance(accountId: string): Promise<NearNativeBalance> {
        const fetchedAt = new Date();
        const { data } = await this.httpService.axiosRef.post<NearRpcResponse<ViewAccountResult>>(
            this.configService.get('NEAR_RPC_URL') || 'https://rpc.mainnet.near.org',
            {
                jsonrpc: '2.0',
                id: 'near-balance',
                method: 'query',
                params: {
                    request_type: 'view_account',
                    finality: 'final',
                    account_id: accountId,
                },
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: Number(this.configService.get('NEAR_RPC_TIMEOUT_MS') || 5000),
            },
        );

        if (data.error || !data.result?.amount) {
            throw new Error(data.error?.message || 'NEAR RPC balance request failed');
        }

        return {
            assetId: NEAR_NATIVE_ASSET_ID,
            symbol: 'NEAR',
            decimals: NEAR_DECIMALS,
            balanceRaw: data.result.amount,
            balanceDecimal: formatDecimal(data.result.amount, NEAR_DECIMALS),
            fetchedAt,
            expiresAt: new Date(fetchedAt.getTime() + Number(this.configService.get('NEAR_BALANCE_TTL_MS') || 15000)),
        };
    }
}

function formatDecimal(raw: string, decimals: number): string {
    if (!/^\d+$/.test(raw)) {
        return '0';
    }

    const padded = raw.padStart(decimals + 1, '0');
    const whole = padded.slice(0, -decimals).replace(/^0+(?=\d)/, '');
    const fraction = padded.slice(-decimals).replace(/0+$/, '');

    return fraction ? `${whole}.${fraction}` : whole;
}
