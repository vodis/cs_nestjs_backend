import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import {
    HyperliquidApiHttpClient,
    HyperliquidCandleInterval,
} from '../../http-clients/hyperliquid-api/hyperliquid-api.http-client';
import { GetMarketCandlesResponseDto, MarketCandleDto } from './dto/get-market-candles-response.dto';
import { HyperliquidCandleDto } from '../../http-clients/hyperliquid-api/dto/hyperliquid-candle.dto';

const intervalMs: Record<HyperliquidCandleInterval, number> = {
    '1m': 60_000,
    '5m': 5 * 60_000,
    '15m': 15 * 60_000,
    '1h': 60 * 60_000,
    '4h': 4 * 60 * 60_000,
    '1d': 24 * 60 * 60_000,
};

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
    constructor(private readonly hyperliquidApiHttpClient: HyperliquidApiHttpClient) {}

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
