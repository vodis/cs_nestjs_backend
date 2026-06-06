import { Injectable } from '@nestjs/common';
import {
    HyperliquidApiHttpClient,
    HyperliquidCandleInterval,
} from '../../http-clients/hyperliquid-api/hyperliquid-api.http-client';
import { GetMarketCandlesResponseDto, MarketCandleDto } from './dto/get-market-candles-response.dto';

const intervalMs: Record<HyperliquidCandleInterval, number> = {
    '1m': 60_000,
    '5m': 5 * 60_000,
    '15m': 15 * 60_000,
    '1h': 60 * 60_000,
    '4h': 4 * 60 * 60_000,
    '1d': 24 * 60 * 60_000,
};

@Injectable()
export class MarketsService {
    constructor(private readonly hyperliquidApiHttpClient: HyperliquidApiHttpClient) {}

    async getCandles(symbol: string, interval: HyperliquidCandleInterval, limit: number): Promise<GetMarketCandlesResponseDto> {
        const normalizedSymbol = symbol.trim().toUpperCase();
        const endTime = Date.now();
        const startTime = endTime - limit * intervalMs[interval];
        const candles = await this.hyperliquidApiHttpClient.getCandles(normalizedSymbol, interval, startTime, endTime);

        return {
            symbol: normalizedSymbol,
            interval,
            candles: candles.map(
                (item): MarketCandleDto => ({
                    time: Math.floor(item.t / 1000),
                    open: Number(item.o),
                    high: Number(item.h),
                    low: Number(item.l),
                    close: Number(item.c),
                    volume: Number(item.v),
                }),
            ),
        };
    }
}
