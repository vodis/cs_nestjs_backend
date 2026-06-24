import { MarketsService } from './markets.service';
import { HyperliquidApiHttpClient } from '../../http-clients/hyperliquid-api/hyperliquid-api.http-client';
import { CoinGeckoMarketHistoryClient } from './coingecko-market-history.client';
import { AssetsService } from '../assets/assets.service';
import { GeckoTerminalMarketHistoryClient } from './geckoterminal-market-history.client';

describe('MarketsService', () => {
    const hyperliquidApiHttpClient = {
        getCandles: jest.fn(),
    } as unknown as jest.Mocked<HyperliquidApiHttpClient>;
    const coinGeckoMarketHistoryClient = {
        getHistory: jest.fn(),
    } as unknown as jest.Mocked<CoinGeckoMarketHistoryClient>;
    const geckoTerminalMarketHistoryClient = {
        getHistory: jest.fn(),
    } as unknown as jest.Mocked<GeckoTerminalMarketHistoryClient>;
    const assetsService = {
        getAssets: jest.fn(),
    } as unknown as jest.Mocked<AssetsService>;
    const originalWebSocket = globalThis.WebSocket;

    beforeEach(() => {
        jest.clearAllMocks();
        coinGeckoMarketHistoryClient.getHistory.mockResolvedValue([]);
        geckoTerminalMarketHistoryClient.getHistory.mockResolvedValue([]);
        assetsService.getAssets.mockResolvedValue({
            data: [
                {
                    assetId: 'nep141:usdc.near',
                    defuseAssetId: 'nep141:usdc.near',
                    symbol: 'USDC',
                    name: 'USD Coin',
                    icon: 'https://example.com/usdc.svg',
                    decimals: 6,
                    blockchain: 'near',
                    price: '1',
                },
                {
                    assetId: 'nep141:wrap.near',
                    defuseAssetId: 'nep141:wrap.near',
                    symbol: 'NEAR',
                    name: 'NEAR Protocol',
                    icon: 'https://example.com/near.svg',
                    decimals: 24,
                    blockchain: 'near',
                    price: '2',
                },
            ],
            meta: {
                source: '1click',
                cached: false,
                fetchedAt: '2026-06-07T00:00:00.000Z',
            },
        });
    });

    afterEach(() => {
        Object.defineProperty(globalThis, 'WebSocket', {
            configurable: true,
            value: originalWebSocket,
        });
    });

    it('normalizes Hyperliquid candles for the chart contract', async () => {
        hyperliquidApiHttpClient.getCandles.mockResolvedValue([
            {
                t: 1764979200000,
                T: 1764982800000,
                s: 'NEAR',
                i: '1h',
                o: '1.91',
                h: '1.98',
                l: '1.88',
                c: '1.95',
                v: '125420.5',
                n: 42,
            },
        ]);

        const result = await new MarketsService(
            hyperliquidApiHttpClient,
            coinGeckoMarketHistoryClient,
            assetsService,
        ).getCandles('near', '1h', 120);

        expect(result).toEqual({
            symbol: 'NEAR',
            interval: '1h',
            candles: [
                {
                    time: 1764979200,
                    open: 1.91,
                    high: 1.98,
                    low: 1.88,
                    close: 1.95,
                    volume: 125420.5,
                },
            ],
        });
        expect(hyperliquidApiHttpClient.getCandles).toHaveBeenCalledWith(
            'NEAR',
            '1h',
            expect.any(Number),
            expect.any(Number),
        );
    });

    it('streams normalized Hyperliquid candle updates', () => {
        const listeners: Record<string, (event: { data?: unknown }) => void> = {};
        const sentMessages: string[] = [];
        const close = jest.fn();

        class FakeWebSocket {
            addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
                listeners[type] = listener;
            }

            send(message: string): void {
                sentMessages.push(message);
            }

            close(): void {
                close();
            }
        }

        Object.defineProperty(globalThis, 'WebSocket', {
            configurable: true,
            value: FakeWebSocket,
        });

        const updates: unknown[] = [];
        const subscription = new MarketsService(hyperliquidApiHttpClient, coinGeckoMarketHistoryClient, assetsService)
            .streamCandles('near', '1m')
            .subscribe({
                next: (event) => updates.push(event),
            });

        listeners.open({});
        listeners.message({
            data: JSON.stringify({
                channel: 'candle',
                data: {
                    t: 1764979200000,
                    T: 1764979260000,
                    s: 'NEAR',
                    i: '1m',
                    o: '1.91',
                    h: '1.98',
                    l: '1.88',
                    c: '1.95',
                    v: '125420.5',
                    n: 42,
                },
            }),
        });

        expect(sentMessages[0]).toEqual(
            JSON.stringify({
                method: 'subscribe',
                subscription: {
                    type: 'candle',
                    coin: 'NEAR',
                    interval: '1m',
                },
            }),
        );
        expect(updates).toEqual([
            {
                data: {
                    symbol: 'NEAR',
                    interval: '1m',
                    candles: [
                        {
                            time: 1764979200,
                            open: 1.91,
                            high: 1.98,
                            low: 1.88,
                            close: 1.95,
                            volume: 125420.5,
                        },
                    ],
                },
            },
        ]);

        subscription.unsubscribe();

        expect(sentMessages[1]).toEqual(
            JSON.stringify({
                method: 'unsubscribe',
                subscription: {
                    type: 'candle',
                    coin: 'NEAR',
                    interval: '1m',
                },
            }),
        );
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('normalizes comparison history and calculates relative strength', async () => {
        hyperliquidApiHttpClient.getCandles
            .mockResolvedValueOnce([
                {
                    t: 1764979200000,
                    T: 1764980100000,
                    s: 'USDC',
                    i: '15m',
                    o: '1',
                    h: '1',
                    l: '1',
                    c: '1',
                    v: '1',
                    n: 1,
                },
                {
                    t: 1764980100000,
                    T: 1764981000000,
                    s: 'USDC',
                    i: '15m',
                    o: '1',
                    h: '1.01',
                    l: '1',
                    c: '1.01',
                    v: '1',
                    n: 1,
                },
            ])
            .mockResolvedValueOnce([
                {
                    t: 1764979200000,
                    T: 1764980100000,
                    s: 'NEAR',
                    i: '15m',
                    o: '2',
                    h: '2',
                    l: '2',
                    c: '2',
                    v: '1',
                    n: 1,
                },
                {
                    t: 1764980100000,
                    T: 1764981000000,
                    s: 'NEAR',
                    i: '15m',
                    o: '2',
                    h: '2.2',
                    l: '2',
                    c: '2.2',
                    v: '1',
                    n: 1,
                },
            ]);

        const result = await new MarketsService(
            hyperliquidApiHttpClient,
            coinGeckoMarketHistoryClient,
            assetsService,
        ).getComparison('usdc', 'near', '1D');

        expect(result.status).toBe('ready');
        expect(result.baseToken).toMatchObject({
            symbol: 'USDC',
            name: 'USD Coin',
            currentPrice: 1,
            changePercent: 1,
            historyAvailable: true,
            marketDataStatus: 'history',
        });
        expect(result.quoteToken).toMatchObject({
            symbol: 'NEAR',
            name: 'NEAR Protocol',
            currentPrice: 2,
            changePercent: 10,
            historyAvailable: true,
            marketDataStatus: 'history',
        });
        expect(result.relativeStrength).toBe(-9);
        expect(result.series).toEqual([
            {
                symbol: 'USDC',
                points: [
                    { time: 1764979200, value: 100 },
                    { time: 1764980100, value: 101 },
                ],
            },
            {
                symbol: 'NEAR',
                points: [
                    { time: 1764979200, value: 100 },
                    { time: 1764980100, value: 110 },
                ],
            },
        ]);
    });

    it('falls back to CoinGecko history and reports partial comparison availability', async () => {
        hyperliquidApiHttpClient.getCandles.mockResolvedValue([]);
        coinGeckoMarketHistoryClient.getHistory
            .mockResolvedValueOnce([
                { time: 1764979200, price: 1 },
                { time: 1764980100, price: 1.02 },
            ])
            .mockResolvedValueOnce([]);

        const result = await new MarketsService(
            hyperliquidApiHttpClient,
            coinGeckoMarketHistoryClient,
            assetsService,
        ).getComparison('USDC', 'REF', '1H');

        expect(result.status).toBe('partial');
        expect(result.baseToken.historyAvailable).toBe(true);
        expect(result.quoteToken.historyAvailable).toBe(false);
        expect(result.relativeStrength).toBeUndefined();
        expect(coinGeckoMarketHistoryClient.getHistory).toHaveBeenCalledWith('USDC', '1H');
        expect(coinGeckoMarketHistoryClient.getHistory).toHaveBeenCalledWith('REF', '1H');
    });

    it('falls back to GeckoTerminal asset history after Hyperliquid and CoinGecko miss', async () => {
        hyperliquidApiHttpClient.getCandles.mockResolvedValue([]);
        coinGeckoMarketHistoryClient.getHistory.mockResolvedValue([]);
        geckoTerminalMarketHistoryClient.getHistory
            .mockResolvedValueOnce([
                { time: 1764979200, price: 1 },
                { time: 1764980100, price: 1.01 },
            ])
            .mockResolvedValueOnce([
                { time: 1764979200, price: 2 },
                { time: 1764980100, price: 2.1 },
            ]);

        const result = await new MarketsService(
            hyperliquidApiHttpClient,
            coinGeckoMarketHistoryClient,
            assetsService,
            geckoTerminalMarketHistoryClient,
        ).getComparison('USDC', 'NEAR', '1D');

        expect(result.status).toBe('ready');
        expect(result.baseToken.marketDataStatus).toBe('history');
        expect(result.quoteToken.marketDataStatus).toBe('history');
        expect(geckoTerminalMarketHistoryClient.getHistory).toHaveBeenCalledWith(
            expect.objectContaining({ symbol: 'USDC' }),
            '1D',
        );
        expect(geckoTerminalMarketHistoryClient.getHistory).toHaveBeenCalledWith(
            expect.objectContaining({ symbol: 'NEAR' }),
            '1D',
        );
    });

    it('returns price_only when no history source has data but current prices are available', async () => {
        hyperliquidApiHttpClient.getCandles.mockResolvedValue([]);
        coinGeckoMarketHistoryClient.getHistory.mockResolvedValue([]);
        geckoTerminalMarketHistoryClient.getHistory.mockResolvedValue([]);

        const result = await new MarketsService(
            hyperliquidApiHttpClient,
            coinGeckoMarketHistoryClient,
            assetsService,
            geckoTerminalMarketHistoryClient,
        ).getComparison('USDC', 'NEAR', '1D');

        expect(result.status).toBe('price_only');
        expect(result.baseToken).toMatchObject({
            currentPrice: 1,
            historyAvailable: false,
            marketDataStatus: 'price_only',
            marketDataReason: 'Current price is available, but no history provider has usable series data.',
        });
        expect(result.quoteToken.marketDataStatus).toBe('price_only');
        expect(result.series).toEqual([
            { symbol: 'USDC', points: [] },
            { symbol: 'NEAR', points: [] },
        ]);
    });
});
