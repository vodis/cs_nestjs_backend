import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { MarketComparisonTimeframe } from './dto/get-market-comparison-query.dto';
import { comparisonTimeframeMs, MarketHistoryPoint, MarketHistoryProvider } from './market-history.types';

interface CoinGeckoMarketChartResponse {
    prices?: [number, number][];
}

const coinGeckoIdsBySymbol: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    NEAR: 'near',
    REF: 'ref-finance',
    SOL: 'solana',
    USDC: 'usd-coin',
    USDT: 'tether',
};

@Injectable()
export class CoinGeckoMarketHistoryClient implements MarketHistoryProvider {
    constructor(
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
    ) {}

    async getHistory(symbol: string, timeframe: MarketComparisonTimeframe): Promise<MarketHistoryPoint[]> {
        const id = this.resolveCoinId(symbol);
        if (!id) {
            return [];
        }

        const end = Date.now();
        const start = end - comparisonTimeframeMs[timeframe];
        const { data } = await this.httpService.axiosRef.get<CoinGeckoMarketChartResponse>(
            `/coins/${encodeURIComponent(id)}/market_chart/range`,
            {
                params: {
                    vs_currency: 'usd',
                    from: Math.floor(start / 1000),
                    to: Math.floor(end / 1000),
                },
            },
        );

        return (data.prices || [])
            .map(([time, price]) => ({
                time: Math.floor(time / 1000),
                price: Number(price),
            }))
            .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price) && point.price > 0);
    }

    private resolveCoinId(symbol: string): string | undefined {
        const normalized = symbol.trim().toUpperCase();
        const configKey = `MARKET_COINGECKO_ID_${normalized}`;
        return this.configService.get<string>(configKey) || coinGeckoIdsBySymbol[normalized];
    }
}
