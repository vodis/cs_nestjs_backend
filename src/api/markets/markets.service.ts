import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AssetsService } from '../assets/assets.service';
import { AssetDto } from '../assets/dto/get-assets-response.dto';
import { CoinGeckoMarketHistoryClient } from './coingecko-market-history.client';
import { MarketComparisonTimeframe } from './dto/get-market-comparison-query.dto';
import {
    GetMarketComparisonResponseDto,
    MarketComparisonStatus,
    MarketComparisonPointDto,
    MarketComparisonTokenDto,
    MarketComparisonTokenStatus,
} from './dto/get-market-comparison-response.dto';
import {
    HyperliquidApiHttpClient,
    HyperliquidCandleInterval,
} from '../../http-clients/hyperliquid-api/hyperliquid-api.http-client';
import { GetMarketCandlesResponseDto, MarketCandleDto } from './dto/get-market-candles-response.dto';
import { GetMarketChartResponseDto } from './dto/get-market-chart-response.dto';
import { HyperliquidCandleDto } from '../../http-clients/hyperliquid-api/dto/hyperliquid-candle.dto';
import { MarketHistoryPoint } from './market-history.types';
import { MarketAssetContext, resolveChartWindow } from './chart-window.config';
import { GeckoTerminalMarketHistoryClient } from './geckoterminal-market-history.client';

const intervalMs: Record<HyperliquidCandleInterval, number> = {
    '1m': 60_000,
    '5m': 5 * 60_000,
    '15m': 15 * 60_000,
    '1h': 60 * 60_000,
    '4h': 4 * 60 * 60_000,
    '1d': 24 * 60 * 60_000,
};

const priceStaleMs = 24 * 60 * 60_000;

type SimpleWebSocketEvent = { data?: unknown };

interface SimpleWebSocket {
    addEventListener(
        type: 'open' | 'message' | 'error' | 'close',
        listener: (event: SimpleWebSocketEvent) => void,
    ): void;
    close(): void;
    send(data: string): void;
}

interface SimpleWebSocketConstructor {
    new (url: string): SimpleWebSocket;
}

interface HyperliquidWsMessage {
    channel?: string;
    data?: HyperliquidCandleDto | HyperliquidCandleDto[];
}

@Injectable()
export class MarketsService {
    constructor(
        private readonly hyperliquidApiHttpClient: HyperliquidApiHttpClient,
        private readonly coinGeckoMarketHistoryClient: CoinGeckoMarketHistoryClient,
        private readonly assetsService: AssetsService,
        private readonly geckoTerminalMarketHistoryClient?: GeckoTerminalMarketHistoryClient,
    ) {}

    async getCandles(
        symbol: string,
        interval: HyperliquidCandleInterval,
        limit: number,
    ): Promise<GetMarketCandlesResponseDto> {
        const normalizedSymbol = symbol.trim().toUpperCase();
        const endTime = Date.now();
        const startTime = endTime - limit * intervalMs[interval];
        const candles = await this.hyperliquidApiHttpClient.getCandles(normalizedSymbol, interval, startTime, endTime);

        return {
            symbol: normalizedSymbol,
            interval,
            candles: candles.map(normalizeCandle),
        };
    }

    async getChart(symbol: string, windowSecs?: number): Promise<GetMarketChartResponseDto> {
        const normalizedSymbol = symbol.trim().toUpperCase();
        const config = resolveChartWindow(windowSecs);
        const endTime = Date.now();
        const startTime = endTime - config.lookbackMs;
        const [candles, context] = await Promise.all([
            this.hyperliquidApiHttpClient.getCandles(normalizedSymbol, config.interval, startTime, endTime),
            this.getAssetContext(normalizedSymbol),
        ]);
        const normalizedCandles = candles.map(normalizeCandle);
        const lastClose = normalizedCandles[normalizedCandles.length - 1]?.close;
        const currentPrice = context.markPx ?? lastClose;

        return {
            symbol: normalizedSymbol,
            interval: config.interval,
            windowSecs: config.windowSecs,
            candles: normalizedCandles,
            prevDayPx: context.prevDayPx,
            currentPrice,
            change24hPercent: this.calculateChange24hPercent(currentPrice, context.prevDayPx),
        };
    }

    async getAssetContext(symbol: string): Promise<MarketAssetContext> {
        const normalizedSymbol = symbol.trim().toUpperCase();
        const [meta, assetCtxs] = await this.hyperliquidApiHttpClient.getMetaAndAssetCtxs();
        const index = meta.universe.findIndex((asset) => asset.name === normalizedSymbol);

        if (index < 0) {
            throw new Error(`Unknown Hyperliquid market: ${normalizedSymbol}`);
        }

        const context = assetCtxs[index];

        return {
            prevDayPx: toNumber(context?.prevDayPx),
            markPx: toNumber(context?.markPx ?? context?.midPx),
        };
    }

    calculateChange24hPercent(currentPrice?: number, prevDayPx?: number): number | undefined {
        if (!Number.isFinite(currentPrice) || !currentPrice || !prevDayPx || prevDayPx <= 0) {
            return undefined;
        }

        return round(((currentPrice - prevDayPx) / prevDayPx) * 100, 2);
    }

    async getComparison(
        base: string,
        quote: string,
        timeframe: MarketComparisonTimeframe,
    ): Promise<GetMarketComparisonResponseDto> {
        const baseSymbol = normalizeSymbol(base);
        const quoteSymbol = normalizeSymbol(quote);
        const assets = await this.getAssetsBySymbol();
        const baseAsset = assets.get(baseSymbol);
        const quoteAsset = assets.get(quoteSymbol);
        const [baseHistory, quoteHistory] = await Promise.all([
            this.getComparisonHistory(baseSymbol, baseAsset, timeframe),
            this.getComparisonHistory(quoteSymbol, quoteAsset, timeframe),
        ]);
        const baseSeries = normalizeHistory(baseHistory);
        const quoteSeries = normalizeHistory(quoteHistory);
        const baseChange = calculateChangePercent(baseHistory);
        const quoteChange = calculateChangePercent(quoteHistory);
        const baseToken = toComparisonToken(baseSymbol, baseAsset, baseChange, baseSeries.length > 0);
        const quoteToken = toComparisonToken(quoteSymbol, quoteAsset, quoteChange, quoteSeries.length > 0);

        return {
            base: baseSymbol,
            quote: quoteSymbol,
            timeframe,
            status: comparisonStatus(baseToken, quoteToken),
            baseToken,
            quoteToken,
            relativeStrength:
                baseChange === undefined || quoteChange === undefined ? undefined : round(baseChange - quoteChange, 2),
            series: [
                { symbol: baseSymbol, points: baseSeries },
                { symbol: quoteSymbol, points: quoteSeries },
            ],
        };
    }

    streamCandles(
        symbol: string,
        interval: HyperliquidCandleInterval,
    ): Observable<{ data: GetMarketCandlesResponseDto }> {
        const normalizedSymbol = symbol.trim().toUpperCase();

        return new Observable((subscriber) => {
            const WebSocketCtor = globalThis.WebSocket as unknown as SimpleWebSocketConstructor | undefined;

            if (!WebSocketCtor) {
                subscriber.error(new Error('WebSocket is not available in this Node runtime'));
                return undefined;
            }

            const ws = new WebSocketCtor('wss://api.hyperliquid.xyz/ws');
            const subscription = {
                type: 'candle',
                coin: normalizedSymbol,
                interval,
            };

            ws.addEventListener('open', () => {
                ws.send(
                    JSON.stringify({
                        method: 'subscribe',
                        subscription,
                    }),
                );
            });

            ws.addEventListener('message', (event) => {
                const message = parseHyperliquidWsMessage(event.data);
                if (message?.channel !== 'candle' || !message.data) {
                    return;
                }

                const candles = Array.isArray(message.data) ? message.data : [message.data];
                for (const candle of candles) {
                    if (candle.s !== normalizedSymbol || candle.i !== interval) {
                        continue;
                    }
                    subscriber.next({
                        data: {
                            symbol: normalizedSymbol,
                            interval,
                            candles: [normalizeCandle(candle)],
                        },
                    });
                }
            });

            ws.addEventListener('error', () => {
                subscriber.error(new Error('Hyperliquid candle stream failed'));
            });

            return () => {
                ws.send(
                    JSON.stringify({
                        method: 'unsubscribe',
                        subscription,
                    }),
                );
                ws.close();
            };
        });
    }

    private async getComparisonHistory(
        symbol: string,
        asset: AssetDto | undefined,
        timeframe: MarketComparisonTimeframe,
    ): Promise<MarketHistoryPoint[]> {
        const hyperliquid = await this.tryHyperliquidHistory(symbol, timeframe);
        if (hyperliquid.length > 0) {
            return hyperliquid;
        }

        try {
            const coingecko = await this.coinGeckoMarketHistoryClient.getHistory(symbol, timeframe);
            if (coingecko.length > 0) {
                return coingecko;
            }
        } catch {
            // Continue to the on-chain fallback below.
        }

        return this.geckoTerminalMarketHistoryClient?.getHistory(asset, timeframe) || [];
    }

    private async tryHyperliquidHistory(
        symbol: string,
        timeframe: MarketComparisonTimeframe,
    ): Promise<MarketHistoryPoint[]> {
        try {
            const interval = hyperliquidIntervalForTimeframe(timeframe);
            const endTime = Date.now();
            const startTime = endTime - hyperliquidLookbackMs(timeframe);
            const candles = await this.hyperliquidApiHttpClient.getCandles(symbol, interval, startTime, endTime);

            return candles
                .map((candle) => ({
                    time: Math.floor(candle.t / 1000),
                    price: Number(candle.c),
                }))
                .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price) && point.price > 0);
        } catch {
            return [];
        }
    }

    private async getAssetsBySymbol(): Promise<Map<string, AssetDto>> {
        try {
            const response = await this.assetsService.getAssets();
            return new Map(response.data.map((asset) => [normalizeSymbol(asset.symbol), asset]));
        } catch {
            return new Map();
        }
    }
}

function parseHyperliquidWsMessage(data: unknown): HyperliquidWsMessage | undefined {
    if (typeof data !== 'string') {
        return undefined;
    }

    try {
        return JSON.parse(data) as HyperliquidWsMessage;
    } catch {
        return undefined;
    }
}

function normalizeCandle(item: HyperliquidCandleDto): MarketCandleDto {
    return {
        time: Math.floor(item.t / 1000),
        open: Number(item.o),
        high: Number(item.h),
        low: Number(item.l),
        close: Number(item.c),
        volume: Number(item.v),
    };
}

function normalizeSymbol(symbol: string): string {
    return symbol.trim().toUpperCase();
}

function hyperliquidIntervalForTimeframe(timeframe: MarketComparisonTimeframe): HyperliquidCandleInterval {
    if (timeframe === '1H') {
        return '1m';
    }

    if (timeframe === '1D') {
        return '15m';
    }

    return '1h';
}

function hyperliquidLookbackMs(timeframe: MarketComparisonTimeframe): number {
    if (timeframe === '1H') {
        return 60 * 60_000;
    }

    if (timeframe === '1D') {
        return 24 * 60 * 60_000;
    }

    return 7 * 24 * 60 * 60_000;
}

function normalizeHistory(history: MarketHistoryPoint[]): MarketComparisonPointDto[] {
    const first = history.find((point) => point.price > 0);
    if (!first) {
        return [];
    }

    return history.map((point) => ({
        time: point.time,
        value: round((point.price / first.price) * 100, 4),
    }));
}

function calculateChangePercent(history: MarketHistoryPoint[]): number | undefined {
    const first = history.find((point) => point.price > 0);
    const last = history[history.length - 1];
    if (!first || !last || last.price <= 0) {
        return undefined;
    }

    return round(((last.price - first.price) / first.price) * 100, 2);
}

function toComparisonToken(
    symbol: string,
    asset: AssetDto | undefined,
    changePercent: number | undefined,
    historyAvailable: boolean,
): MarketComparisonTokenDto {
    const currentPrice = toNumber(asset?.price);
    const marketDataStatus = tokenStatus(asset, historyAvailable, currentPrice);

    return {
        symbol,
        name: asset?.name,
        icon: asset?.icon,
        currentPrice,
        changePercent,
        historyAvailable,
        marketDataStatus,
        marketDataReason: tokenReason(marketDataStatus),
    };
}

function comparisonStatus(
    baseToken: MarketComparisonTokenDto,
    quoteToken: MarketComparisonTokenDto,
): MarketComparisonStatus {
    const statuses = [baseToken.marketDataStatus, quoteToken.marketDataStatus];
    const historyCount = statuses.filter((status) => status === 'history').length;

    if (historyCount === 2) {
        return 'ready';
    }

    if (historyCount === 1) {
        return 'partial';
    }

    if (statuses.includes('stale')) {
        return 'stale';
    }

    if (statuses.includes('price_only')) {
        return 'price_only';
    }

    return 'unsupported';
}

function tokenStatus(
    asset: AssetDto | undefined,
    historyAvailable: boolean,
    currentPrice: number | undefined,
): MarketComparisonTokenStatus {
    if (historyAvailable) {
        return 'history';
    }

    if (currentPrice === undefined) {
        return 'unsupported';
    }

    return isStalePrice(asset?.priceUpdatedAt) ? 'stale' : 'price_only';
}

function tokenReason(status: MarketComparisonTokenStatus): string | undefined {
    if (status === 'price_only') {
        return 'Current price is available, but no history provider has usable series data.';
    }

    if (status === 'unsupported') {
        return 'No current price or history provider data is available for this asset.';
    }

    if (status === 'stale') {
        return 'Current price exists, but it is older than the accepted freshness window and no history is available.';
    }

    return undefined;
}

function isStalePrice(priceUpdatedAt?: string): boolean {
    if (!priceUpdatedAt) {
        return false;
    }

    const updatedAt = Date.parse(priceUpdatedAt);
    return Number.isFinite(updatedAt) && Date.now() - updatedAt > priceStaleMs;
}

function toNumber(value: string | number | undefined): number | undefined {
    const parsed = typeof value === 'number' ? value : value === undefined ? Number.NaN : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function round(value: number, precision: number): number {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
}
