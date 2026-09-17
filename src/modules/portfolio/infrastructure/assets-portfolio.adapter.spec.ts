import { AssetsService } from '../../../api/assets/assets.service';
import { AssetsPortfolioAdapter } from './assets-portfolio.adapter';

describe('AssetsPortfolioAdapter', () => {
    it('uses the wrapped NEAR market price to value native NEAR', async () => {
        const assets = {
            getAssets: jest.fn().mockResolvedValue({
                data: [
                    {
                        assetId: 'nep141:wrap.near',
                        defuseAssetId: 'nep141:wrap.near',
                        symbol: 'wNEAR',
                        decimals: 24,
                        blockchain: 'near',
                        price: '2.75',
                        priceUpdatedAt: '2026-09-17T12:00:00.000Z',
                    },
                ],
                meta: { source: '1click', cached: false, fetchedAt: '2026-09-17T12:00:00.000Z' },
            }),
        };

        const result = await new AssetsPortfolioAdapter(assets as unknown as AssetsService).getAssets();

        expect(result).toContainEqual({
            assetId: 'near:native',
            priceUsd: '2.75',
            priceUpdatedAt: '2026-09-17T12:00:00.000Z',
        });
    });
});
