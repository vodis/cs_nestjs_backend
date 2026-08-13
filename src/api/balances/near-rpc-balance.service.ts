import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NearRpcApiHttpClient } from '../../http-clients/near-rpc-api/near-rpc-api.http-client';
import { formatTokenAmount } from '../../utils/decimal.util';
import {
    NEAR_BALANCE_TTL_MS,
    NEAR_NATIVE_ASSET_ID,
    NEAR_NATIVE_DECIMALS,
    NEAR_NATIVE_SYMBOL,
} from './near-balance.constants';

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
        private readonly nearRpcApiHttpClient: NearRpcApiHttpClient,
        private readonly configService: ConfigService,
    ) {}

    async getNativeBalance(accountId: string): Promise<NearNativeBalance> {
        const fetchedAt = new Date();
        const account = await this.nearRpcApiHttpClient.viewAccount(accountId);

        if (!account?.amount) {
            throw new Error('NEAR RPC balance request failed');
        }

        return {
            assetId: NEAR_NATIVE_ASSET_ID,
            symbol: NEAR_NATIVE_SYMBOL,
            decimals: NEAR_NATIVE_DECIMALS,
            balanceRaw: account.amount,
            balanceDecimal: formatTokenAmount(account.amount, NEAR_NATIVE_DECIMALS),
            fetchedAt,
            expiresAt: new Date(
                fetchedAt.getTime() + Number(this.configService.get('NEAR_BALANCE_TTL_MS') || NEAR_BALANCE_TTL_MS),
            ),
        };
    }
}
