import { MarketsService } from './markets.service';
import { HyperliquidApiHttpClient } from '../../http-clients/hyperliquid-api/hyperliquid-api.http-client';

describe('MarketsService', () => {
    const hyperliquidApiHttpClient = {
        getCandles: jest.fn(),
    } as unknown as jest.Mocked<HyperliquidApiHttpClient>;

    beforeEach(() => {
        jest.clearAllMocks();
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
});
