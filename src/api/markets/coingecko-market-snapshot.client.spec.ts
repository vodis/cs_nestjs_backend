import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { CoinGeckoMarketSnapshotClient, CoinGeckoRequestError } from './coingecko-market-snapshot.client';

describe('CoinGeckoMarketSnapshotClient', () => {
    const get = jest.fn();
    const httpService = { axiosRef: { get } } as unknown as HttpService;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('skips CoinGecko when no API key is configured', async () => {
        const client = new CoinGeckoMarketSnapshotClient(config(), httpService);

        await expect(client.getMarkets(['near'])).resolves.toEqual([]);
        expect(client.hasApiKey()).toBe(false);
        expect(get).not.toHaveBeenCalled();
    });

    it('requests market snapshots with the demo API key', async () => {
        get.mockResolvedValue({
            data: [
                {
                    id: 'near',
                    current_price: 5.1,
                    market_cap: 6_100_000_000,
                    total_volume: 312_000_000,
                    price_change_percentage_24h: 3.42,
                    sparkline_in_7d: { price: [4.8, 5.1] },
                },
            ],
        });
        const client = new CoinGeckoMarketSnapshotClient(
            config({ COINGECKO_API_KEY: 'demo-key', COINGECKO_API_URL: 'https://api.coingecko.com/api/v3' }),
            httpService,
        );

        await expect(client.getMarkets(['near', 'bitcoin'])).resolves.toEqual([
            expect.objectContaining({ id: 'near', current_price: 5.1 }),
        ]);
        expect(get).toHaveBeenCalledWith('/coins/markets', {
            params: {
                vs_currency: 'usd',
                ids: 'near,bitcoin',
                sparkline: true,
                price_change_percentage: '24h',
                per_page: 2,
            },
            headers: { 'x-cg-demo-api-key': 'demo-key' },
        });
    });

    it('uses the pro API key header for the pro base URL', async () => {
        get.mockResolvedValue({ data: [] });
        const client = new CoinGeckoMarketSnapshotClient(
            config({
                COINGECKO_API_KEY: 'pro-key',
                COINGECKO_API_URL: 'https://pro-api.coingecko.com/api/v3',
            }),
            httpService,
        );

        await client.getMarkets(['near']);

        expect(get).toHaveBeenCalledWith(
            '/coins/markets',
            expect.objectContaining({ headers: { 'x-cg-pro-api-key': 'pro-key' } }),
        );
    });

    it('turns a rejected API key into an error that does not include the key', async () => {
        const secret = 'super-secret-key';
        get.mockRejectedValue({
            isAxiosError: true,
            message: `Request failed with ${secret}`,
            config: { headers: { 'x-cg-demo-api-key': secret } },
            response: {
                status: 401,
                data: { status: { error_message: `Invalid API key ${secret}` } },
            },
        });
        const client = new CoinGeckoMarketSnapshotClient(
            config({ COINGECKO_API_KEY: secret, COINGECKO_API_URL: 'https://api.coingecko.com/api/v3' }),
            httpService,
        );

        const error = await client.getMarkets(['near']).then(
            () => {
                throw new Error('expected CoinGecko rejection');
            },
            (caught: unknown) => caught,
        );

        expect(error).toBeInstanceOf(CoinGeckoRequestError);
        expect(error).toMatchObject({ status: 401, message: 'Invalid API key [redacted]' });
        expect(JSON.stringify(error)).not.toContain(secret);
    });
});

function config(values: Record<string, string> = {}): ConfigService {
    return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}
