import { AxiosError, AxiosHeaders } from 'axios';
import { MarketHistoryCache } from './market-history-cache';

describe('MarketHistoryCache', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('coalesces reads, caches empty unsupported history, and refreshes expired data', async () => {
        const cache = new MarketHistoryCache<number[]>();
        const load = jest.fn().mockResolvedValueOnce([]).mockResolvedValue([2]);
        expect(await Promise.all([cache.get('coin:1H', load), cache.get('coin:1H', load)])).toEqual([[], []]);
        expect(await cache.get('coin:1H', load)).toEqual([]);
        expect(load).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(60_000);
        expect(await cache.get('coin:1H', load)).toEqual([2]);
        expect(load).toHaveBeenCalledTimes(2);
        expect(await cache.get('coin:1D', load)).toEqual([2]);
        expect(load).toHaveBeenCalledTimes(3);
    });

    it('backs off failed history without masking errors and resets after recovery', async () => {
        const cache = new MarketHistoryCache<number[]>();
        const load = jest.fn().mockRejectedValue(new Error('provider down'));
        await expect(cache.get('ETH', load)).rejects.toThrow('provider down');
        await expect(cache.get('ETH', load)).rejects.toThrow('provider down');
        expect(load).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(30_000);
        await expect(cache.get('ETH', load)).rejects.toThrow('provider down');
        jest.advanceTimersByTime(30_000);
        await expect(cache.get('ETH', load)).rejects.toThrow('provider down');
        expect(load).toHaveBeenCalledTimes(2);
        jest.advanceTimersByTime(30_000);
        load.mockResolvedValueOnce([1]);
        expect(await cache.get('ETH', load)).toEqual([1]);
        jest.advanceTimersByTime(60_000);
        await expect(cache.get('ETH', load)).rejects.toThrow('provider down');
        jest.advanceTimersByTime(30_000);
        load.mockResolvedValueOnce([2]);
        expect(await cache.get('ETH', load)).toEqual([2]);
    });

    it.each(['120', new Date(Date.now() + 120_000).toUTCString()])(
        'honors provider-wide Retry-After %s while retaining fresh cached data',
        async (retryAfter) => {
            const cache = new MarketHistoryCache<number[]>();
            await cache.get('cached', async () => [1]);
            const error = new AxiosError('rate limited', 'ERR_BAD_REQUEST', undefined, undefined, {
                status: 429,
                statusText: 'Too Many Requests',
                data: {},
                headers: { 'retry-after': retryAfter },
                config: { headers: new AxiosHeaders() },
            });
            const load = jest.fn().mockRejectedValueOnce(error).mockResolvedValue([2]);
            await expect(cache.get('USDC', load)).rejects.toBe(error);
            expect(await cache.get('cached', load)).toEqual([1]);
            jest.advanceTimersByTime(60_000);
            await expect(cache.get('another', load)).rejects.toThrow('rate limited');
            expect(load).toHaveBeenCalledTimes(1);
            jest.advanceTimersByTime(60_000);
            expect(await cache.get('another', load)).toEqual([2]);
        },
    );

    it('bounds retained entries', async () => {
        const cache = new MarketHistoryCache<number[]>();
        const load = jest.fn().mockResolvedValue([1]);
        for (let i = 0; i < 257; i++) await cache.get(String(i), load);
        await cache.get('0', load);
        expect(load).toHaveBeenCalledTimes(258);
    });
});
