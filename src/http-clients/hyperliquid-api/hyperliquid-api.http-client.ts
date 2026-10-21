import { MarketHistoryCache } from '../market-history-cache';
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { HyperliquidCandleDto } from './dto/hyperliquid-candle.dto';
import { HyperliquidAssetContextDto, HyperliquidMetaDto } from './dto/hyperliquid-asset-context.dto';

export type HyperliquidCandleInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

@Injectable()
export class HyperliquidApiHttpClient {
    private readonly candles = new MarketHistoryCache<HyperliquidCandleDto[]>();

    constructor(private readonly httpServer: HttpService) {}

    async getCandles(
        coin: string,
        interval: HyperliquidCandleInterval,
        startTime: number,
        endTime: number,
    ): Promise<HyperliquidCandleDto[]> {
        // Moving windows within one minute share display history, never trading authorization.
        const key = JSON.stringify([coin, interval, Math.floor(startTime / 60_000), Math.floor(endTime / 60_000)]);
        return this.candles.get(
            key,
            async () => {
                const { data } = await this.httpServer.axiosRef.post<HyperliquidCandleDto[]>('/info', {
                    type: 'candleSnapshot',
                    req: {
                        coin,
                        interval,
                        startTime,
                        endTime,
                    },
                });

                return data;
            },
            JSON.stringify([coin, interval, Math.round((endTime - startTime) / 60_000)]),
        );
    }

    async getMetaAndAssetCtxs(): Promise<[HyperliquidMetaDto, HyperliquidAssetContextDto[]]> {
        const { data } = await this.httpServer.axiosRef.post<[HyperliquidMetaDto, HyperliquidAssetContextDto[]]>(
            '/info',
            {
                type: 'metaAndAssetCtxs',
            },
        );

        return data;
    }
}
