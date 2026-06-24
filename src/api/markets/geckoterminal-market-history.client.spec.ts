import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { GeckoTerminalMarketHistoryClient } from './geckoterminal-market-history.client';
import { AssetDto } from '../assets/dto/get-assets-response.dto';

describe('GeckoTerminalMarketHistoryClient', () => {
    const get = jest.fn();
    const httpService = {
        axiosRef: {
            get,
        },
    } as unknown as HttpService;
    const configService = {
        get: jest.fn((key: string) => {
            const values: Record<string, string> = {
                MARKET_HISTORY_ENABLE_GECKOTERMINAL: 'true',
                GECKOTERMINAL_API_URL: 'https://api.geckoterminal.test/api/v2',
                GECKOTERMINAL_API_VERSION: '20230302',
                GECKOTERMINAL_RATE_LIMIT_PER_MINUTE: '30',
                MARKET_HISTORY_CACHE_TTL_MS: '300000',
                MARKET_HISTORY_RESOLUTION_CACHE_TTL_MS: '86400000',
            };
            return values[key];
        }),
    } as unknown as ConfigService;
    const asset: AssetDto = {
        assetId: 'nep141:base-0x532f27101965dd16442e59d40670faf5ebb142e4.omft.near',
        defuseAssetId: 'nep141:base-0x532f27101965dd16442e59d40670faf5ebb142e4.omft.near',
        symbol: 'BRETT',
        decimals: 18,
        blockchain: 'base',
        contractAddress: '0x532f27101965dd16442e59d40670faf5ebb142e4',
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('resolves the highest-liquidity token pool and normalizes OHLCV close history', async () => {
        get.mockResolvedValueOnce({
            data: {
                data: [
                    {
                        id: 'base_low-liquidity',
                        attributes: {
                            address: 'low-liquidity',
                            reserve_in_usd: '10',
                            volume_usd: { h24: '1000' },
                        },
                    },
                    {
                        id: 'base_high-liquidity',
                        attributes: {
                            address: 'high-liquidity',
                            reserve_in_usd: '200',
                            volume_usd: { h24: '100' },
                        },
                    },
                ],
            },
        });
        get.mockResolvedValueOnce({
            data: {
                data: {
                    attributes: {
                        ohlcv_list: [
                            [1764980100, 1, 1.2, 0.9, 1.1, 100],
                            [1764979200, 1, 1, 1, 1, 50],
                        ],
                    },
                },
            },
        });

        const result = await new GeckoTerminalMarketHistoryClient(configService, httpService).getHistory(asset, '1D');

        expect(result).toEqual([
            { time: 1764979200, price: 1 },
            { time: 1764980100, price: 1.1 },
        ]);
        expect(get).toHaveBeenNthCalledWith(
            1,
            'https://api.geckoterminal.test/api/v2/networks/base/tokens/0x532f27101965dd16442e59d40670faf5ebb142e4/pools',
            expect.objectContaining({
                headers: { Accept: 'application/json;version=20230302' },
            }),
        );
        expect(get).toHaveBeenNthCalledWith(
            2,
            'https://api.geckoterminal.test/api/v2/networks/base/pools/high-liquidity/ohlcv/hour',
            expect.objectContaining({
                params: {
                    aggregate: 1,
                    currency: 'usd',
                    limit: 24,
                },
            }),
        );
    });

    it('returns no history when disabled or when the asset network cannot be resolved', async () => {
        const disabledConfig = {
            get: jest.fn(() => 'false'),
        } as unknown as ConfigService;

        await expect(
            new GeckoTerminalMarketHistoryClient(disabledConfig, httpService).getHistory(asset, '1D'),
        ).resolves.toEqual([]);
        await expect(
            new GeckoTerminalMarketHistoryClient(configService, httpService).getHistory(
                { ...asset, blockchain: 'near', contractAddress: 'wrap.near' },
                '1D',
            ),
        ).resolves.toEqual([]);
        expect(get).not.toHaveBeenCalled();
    });

    it('fails closed when the process-local rate limit is exhausted', async () => {
        const limitedConfig = {
            get: jest.fn((key: string) => {
                const values: Record<string, string> = {
                    MARKET_HISTORY_ENABLE_GECKOTERMINAL: 'true',
                    GECKOTERMINAL_RATE_LIMIT_PER_MINUTE: '1',
                };
                return values[key];
            }),
        } as unknown as ConfigService;

        get.mockResolvedValueOnce({
            data: {
                data: [{ id: 'base_pool', attributes: { address: 'pool', reserve_in_usd: '100' } }],
            },
        });

        const result = await new GeckoTerminalMarketHistoryClient(limitedConfig, httpService).getHistory(asset, '1D');

        expect(result).toEqual([]);
        expect(get).toHaveBeenCalledTimes(1);
    });
});
