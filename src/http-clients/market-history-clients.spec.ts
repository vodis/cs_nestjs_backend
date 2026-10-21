import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { HyperliquidApiHttpClient } from './hyperliquid-api/hyperliquid-api.http-client';
import { CoinGeckoMarketHistoryClient } from '../api/markets/coingecko-market-history.client';

describe('market history client caching', () => {
    it('coalesces equivalent candle windows but separates coins and intervals', async () => {
        const http = new HttpService(axios.create());
        const post = jest.spyOn(http.axiosRef, 'post').mockResolvedValue({ data: [] });
        const client = new HyperliquidApiHttpClient(http);
        await Promise.all([
            client.getCandles('ETH', '1m', 60_000, 120_000),
            client.getCandles('ETH', '1m', 60_001, 120_001),
        ]);
        expect(post).toHaveBeenCalledTimes(1);
        await client.getCandles('BTC', '1m', 60_000, 120_000);
        await client.getCandles('ETH', '5m', 60_000, 120_000);
        expect(post).toHaveBeenCalledTimes(3);
    });

    it('coalesces CoinGecko history by normalized asset and timeframe', async () => {
        const http = new HttpService(axios.create());
        const get = jest.spyOn(http.axiosRef, 'get').mockResolvedValue({ data: { prices: [[1_000, 1]] } });
        const client = new CoinGeckoMarketHistoryClient(new ConfigService(), http);
        expect(await Promise.all([client.getHistory('USDC', '1H'), client.getHistory('usdc', '1H')])).toEqual([
            [{ time: 1, price: 1 }],
            [{ time: 1, price: 1 }],
        ]);
        expect(get).toHaveBeenCalledTimes(1);
        await client.getHistory('USDC', '1D');
        expect(get).toHaveBeenCalledTimes(2);
    });
    it('keeps candle failure cooldown across moving minute boundaries', async () => {
        jest.useFakeTimers();
        try {
            const http = new HttpService(axios.create());
            const post = jest.spyOn(http.axiosRef, 'post').mockRejectedValue(new Error('upstream 500'));
            const client = new HyperliquidApiHttpClient(http);
            const read = () => client.getCandles('USDC', '1m', Date.now() - 3_600_000, Date.now());
            await expect(read()).rejects.toThrow('upstream 500');
            jest.advanceTimersByTime(30_000);
            await expect(read()).rejects.toThrow('upstream 500');
            jest.advanceTimersByTime(30_000);
            await expect(read()).rejects.toThrow('upstream 500');
            expect(post).toHaveBeenCalledTimes(2);
            jest.advanceTimersByTime(30_000);
            post.mockResolvedValueOnce({ data: [] });
            expect(await read()).toEqual([]);
            expect(post).toHaveBeenCalledTimes(3);
        } finally {
            jest.useRealTimers();
        }
    });
});
