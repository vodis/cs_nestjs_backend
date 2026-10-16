import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AssetsService } from '../../../../api/assets/assets.service';
import { OneClickApiHttpClient } from '../../../../http-clients/one-click-api/one-click-api.http-client';
import { BITCOIN_MAINNET } from '@vodis/cs-assets';
import { AssetRegistryAdapter } from './asset-registry.adapter';

describe('PR 266 normalized asset registry port', () => {
    it.each([
        ['btc', '1cs_v1:btc:native:coin', BITCOIN_MAINNET, '1cs_v1:btc:native:coin', `${BITCOIN_MAINNET}/native`],
        ['eth', '1cs_v1:btc:native:coin', 'eip155:1', undefined, undefined],
        ['unknown', '1cs_v1:btc:native:coin', undefined, undefined, undefined],
        ['toString', 'unknown', undefined, undefined, undefined],
        ['eth', 'nep141:eth.omft.near', 'eip155:1', 'nep141:eth.omft.near', 'eip155:1/native'],
        ['near', 'nep141:wrap.near', 'near:mainnet', 'near:native', undefined],
        ['near', '1cs_v1:near:nep141:wrap.near', 'near:mainnet', 'near:native', undefined],
        ['near', 'nep141:usdc.near', 'near:mainnet', undefined, undefined],
        ['btc', 'unknown', BITCOIN_MAINNET, undefined, undefined],
    ])(
        'normalizes %s route %s at the registry boundary',
        async (blockchain, assetId, network, fundingId, balanceId) => {
            const module = await Test.createTestingModule({
                providers: [
                    AssetsService,
                    AssetRegistryAdapter,
                    { provide: ConfigService, useValue: new ConfigService() },
                    {
                        provide: OneClickApiHttpClient,
                        useValue: {
                            getTokens: jest
                                .fn()
                                .mockResolvedValue([
                                    { assetId, blockchain, decimals: 8, symbol: 'NEVER_USE_SYMBOL_FOR_IDENTITY' },
                                ]),
                        },
                    },
                ],
            }).compile();
            const registry = module.get(AssetRegistryAdapter);
            const asset = await registry.findById(assetId);
            expect(asset).toBeDefined();
            expect(asset?.sourceNetwork).toBe(network);
            expect(asset?.nativeFundingSourceAssetId).toBe(fundingId);
            const catalogAsset = await module.get(AssetsService).findAssetById(assetId);
            expect(catalogAsset?.balanceAssetId).toBe(balanceId);
            expect(await registry.findById('absent')).toBeUndefined();
            await module.close();
        },
    );
});
