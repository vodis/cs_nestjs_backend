import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { OneClickApiHttpClient } from '../../http-clients/one-click-api/one-click-api.http-client';
import { OneClickTokenDto } from '../../http-clients/one-click-api/dto/one-click-token.dto';

describe('AssetsService', () => {
    const validToken: OneClickTokenDto = {
        assetId: 'nep141:wrap.near',
        decimals: 24,
        blockchain: 'near',
        symbol: 'wNEAR',
        price: '2.79',
        priceUpdatedAt: '2026-02-27T15:18:30.437Z',
        contractAddress: 'wrap.near',
    };

    const createService = (getTokens: jest.Mock, ttl = 300000): AssetsService => {
        const configService = {
            get: jest.fn((key: string) => (key === 'ASSETS_CACHE_TTL_MS' ? ttl : undefined)),
        } as unknown as ConfigService;

        const client = {
            getTokens,
        } as unknown as OneClickApiHttpClient;

        return new AssetsService(configService, client);
    };

    it('maps 1Click assetId to assetId and defuseAssetId', async () => {
        const service = createService(jest.fn().mockResolvedValue([validToken]));

        const result = await service.getAssets();

        expect(result).toEqual({
            data: [
                {
                    assetId: 'nep141:wrap.near',
                    defuseAssetId: 'nep141:wrap.near',
                    symbol: 'wNEAR',
                    name: 'NEAR Protocol',
                    icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/6535.png',
                    decimals: 24,
                    blockchain: 'near',
                    contractAddress: 'wrap.near',
                    price: '2.79',
                    priceUpdatedAt: '2026-02-27T15:18:30.437Z',
                },
            ],
            meta: {
                source: '1click',
                cached: false,
                fetchedAt: expect.any(String),
            },
        });
    });

    it('returns cached data within ttl without a second upstream call', async () => {
        const getTokens = jest.fn().mockResolvedValue([validToken]);
        const service = createService(getTokens);

        await service.getAssets();
        const secondResult = await service.getAssets();

        expect(getTokens).toHaveBeenCalledTimes(1);
        expect(secondResult.meta.cached).toBe(true);
    });

    it('falls back to stale cache when upstream fails after ttl expires', async () => {
        const getTokens = jest
            .fn()
            .mockResolvedValueOnce([validToken])
            .mockRejectedValueOnce(new Error('upstream down'));
        const service = createService(getTokens, 1);

        await service.getAssets();
        await new Promise((resolve) => setTimeout(resolve, 2));
        const staleResult = await service.getAssets();

        expect(getTokens).toHaveBeenCalledTimes(2);
        expect(staleResult.data).toHaveLength(1);
        expect(staleResult.meta.cached).toBe(true);
    });

    it('throws when upstream fails and no cache exists', async () => {
        const service = createService(jest.fn().mockRejectedValue(new Error('upstream down')));

        await expect(service.getAssets()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('filters malformed upstream token entries', async () => {
        const service = createService(
            jest
                .fn()
                .mockResolvedValue([
                    validToken,
                    { assetId: '', decimals: 6, blockchain: 'near', symbol: 'BAD' },
                    { assetId: 'nep141:bad.near', decimals: '6', blockchain: 'near', symbol: 'BAD' },
                    { assetId: 'nep141:bad.near', decimals: 6, blockchain: '', symbol: 'BAD' },
                ]),
        );

        const result = await service.getAssets();

        expect(result.data).toHaveLength(1);
        expect(result.data[0].assetId).toBe(validToken.assetId);
    });

    it('enriches assets from the seeded frontend token metadata by symbol fallback', async () => {
        const service = createService(
            jest.fn().mockResolvedValue([
                {
                    assetId: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
                    decimals: 6,
                    blockchain: 'eth',
                    symbol: 'USDC',
                },
            ]),
        );

        const result = await service.getAssets();

        expect(result.data[0]).toMatchObject({
            name: 'USD Coin',
            icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/3408.png',
        });
    });
});
