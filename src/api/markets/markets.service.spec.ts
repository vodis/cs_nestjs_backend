import { MarketsService } from './markets.service';
import { HyperliquidApiHttpClient } from '../../http-clients/hyperliquid-api/hyperliquid-api.http-client';

describe('MarketsService', () => {
    const hyperliquidApiHttpClient = {
        getCandles: jest.fn(),
    } as unknown as jest.Mocked<HyperliquidApiHttpClient>;
    const originalWebSocket = globalThis.WebSocket;

    beforeEach(() => {
        jest.clearAllMocks();
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

        const result = await new MarketsService(hyperliquidApiHttpClient).getCandles('near', '1h', 120);

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
        const subscription = new MarketsService(hyperliquidApiHttpClient).streamCandles('near', '1m').subscribe({
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
});
