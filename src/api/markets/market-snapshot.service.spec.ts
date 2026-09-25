import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoinGeckoMarketSnapshotClient, CoinGeckoRequestError } from './coingecko-market-snapshot.client';
import { MarketSnapshotService } from './market-snapshot.service';

describe('MarketSnapshotService', () => {
    const getMarkets = jest.fn();
    const hasApiKey = jest.fn();
    const client = { getMarkets, hasApiKey } as unknown as CoinGeckoMarketSnapshotClient;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(Date, 'now').mockReturnValue(1_000);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns zeros and a flat line when CoinGecko is not configured', async () => {
        hasApiKey.mockReturnValue(false);
        const service = new MarketSnapshotService(client, config());

        const result = await service.getSnapshots('near, BTC');

        expect(getMarkets).not.toHaveBeenCalled();
        expect(result.meta.source).toBe('unavailable');
        expect(result.data).toEqual([empty('NEAR'), empty('BTC')]);
    });

    it('maps a CoinGecko response and serves the next request from cache', async () => {
        hasApiKey.mockReturnValue(true);
        getMarkets.mockResolvedValue([
            {
                id: 'near',
                current_price: 5.1,
                market_cap: 6_100_000_000,
                total_volume: 312_000_000,
                price_change_percentage_24h: 3.42,
                sparkline_in_7d: { price: [4.8, 5.1, 5.0] },
            },
        ]);
        const service = new MarketSnapshotService(client, config());

        const first = await service.getSnapshots('NEAR,PUBLIC');
        const second = await service.getSnapshots('NEAR');

        expect(getMarkets).toHaveBeenCalledTimes(1);
        expect(getMarkets).toHaveBeenCalledWith(['near', 'publicai']);
        expect(first.meta).toEqual(expect.objectContaining({ source: 'coingecko', cached: false }));
        expect(first.data[0]).toEqual({
            symbol: 'NEAR',
            priceUsd: 5.1,
            change24hPercent: 3.42,
            marketCapUsd: 6_100_000_000,
            volume24hUsd: 312_000_000,
            sparkline7d: [4.8, 5.1, 5.0],
        });
        expect(first.data[1]).toEqual(empty('PUBLIC'));
        expect(second.meta.cached).toBe(true);
        expect(second.data[0].priceUsd).toBe(5.1);

        await service.getSnapshots('PUBLIC');
        expect(getMarkets).toHaveBeenCalledTimes(1);
    });

    it('keeps the last cached snapshot when a later CoinGecko call fails', async () => {
        hasApiKey.mockReturnValue(true);
        getMarkets.mockResolvedValueOnce([
            {
                id: 'bitcoin',
                current_price: 63_000,
                market_cap: 1_200_000_000_000,
                total_volume: 18_000_000_000,
                price_change_percentage_24h: 1.2,
                sparkline_in_7d: { price: [60_000, 63_000] },
            },
        ]);
        const service = new MarketSnapshotService(client, config({ MARKET_SNAPSHOT_CACHE_TTL_MS: '1000' }));

        await service.getSnapshots('BTC');
        jest.spyOn(Date, 'now').mockReturnValue(3_000);
        getMarkets.mockRejectedValueOnce(new Error('rate limited'));

        const result = await service.getSnapshots('BTC');

        expect(result.data[0].priceUsd).toBe(63_000);
        expect(result.meta.source).toBe('coingecko');
    });

    it('returns zeros when CoinGecko fails and nothing is cached', async () => {
        hasApiKey.mockReturnValue(true);
        getMarkets.mockRejectedValue(new Error('unavailable'));
        const service = new MarketSnapshotService(client, config());

        const result = await service.getSnapshots('USDT');

        expect(result.data).toEqual([empty('USDT')]);
        expect(result.meta).toEqual(expect.objectContaining({ source: 'unavailable', cached: false }));
    });

    it('returns zeros and logs when CoinGecko rejects the API key', async () => {
        const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        hasApiKey.mockReturnValue(true);
        getMarkets.mockRejectedValue(new CoinGeckoRequestError(401, 'Invalid API key [redacted]'));
        const service = new MarketSnapshotService(client, config());

        const result = await service.getSnapshots('NEAR');

        expect(result.data).toEqual([empty('NEAR')]);
        expect(result.meta).toEqual(expect.objectContaining({ source: 'unavailable', cached: false }));
        expect(errorLog).toHaveBeenCalledWith(
            'CoinGecko market snapshot failed status=401: Invalid API key [redacted]',
        );
        expect(JSON.stringify(errorLog.mock.calls)).not.toContain('super-secret-key');
    });

    it('returns a fresh cached snapshot without waiting for an unrelated fetch', async () => {
        hasApiKey.mockReturnValue(true);
        const bitcoin = deferred<[]>();
        getMarkets
            .mockResolvedValueOnce([
                {
                    id: 'near',
                    current_price: 5.1,
                    market_cap: 6_100_000_000,
                    total_volume: 312_000_000,
                    price_change_percentage_24h: 3.42,
                    sparkline_in_7d: { price: [4.8, 5.1] },
                },
            ])
            .mockReturnValueOnce(bitcoin.promise);
        const service = new MarketSnapshotService(client, config());

        await service.getSnapshots('NEAR');
        const pendingBitcoin = service.getSnapshots('BTC');
        await Promise.resolve();

        await expect(
            Promise.race([
                service.getSnapshots('NEAR').then(() => 'cached'),
                new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 25)),
            ]),
        ).resolves.toBe('cached');

        bitcoin.resolve([]);
        await pendingBitcoin;
    });

    it('marks unmapped symbols as unavailable rather than cached CoinGecko data', async () => {
        hasApiKey.mockReturnValue(true);
        const service = new MarketSnapshotService(client, config());

        const result = await service.getSnapshots('UNKNOWN');

        expect(getMarkets).not.toHaveBeenCalled();
        expect(result.meta).toEqual(expect.objectContaining({ source: 'unavailable', cached: false }));
    });

    it('rejects an empty symbol list', async () => {
        const service = new MarketSnapshotService(client, config());

        await expect(service.getSnapshots(' , ')).rejects.toThrow('At least one symbol is required');
    });
});

function config(values: Record<string, string> = {}): ConfigService {
    return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

function empty(symbol: string) {
    return {
        symbol,
        priceUsd: 0,
        change24hPercent: 0,
        marketCapUsd: 0,
        volume24hUsd: 0,
        sparkline7d: [0, 0],
    };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((promiseResolve) => {
        resolve = promiseResolve;
    });
    return { promise, resolve };
}
