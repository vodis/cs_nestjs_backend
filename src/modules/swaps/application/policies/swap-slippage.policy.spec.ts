import { AssetRegistryEntry } from '../../domain/models/asset-registry-entry';
import { SwapQuote } from '../../domain/models/swap-quote';
import { SwapValidationError } from '../../domain/errors/swap-validation.error';
import { SwapSlippagePolicy } from './swap-slippage.policy';

describe('SwapSlippagePolicy', () => {
    const policy = new SwapSlippagePolicy();
    const near: AssetRegistryEntry = {
        assetId: 'nep141:wrap.near',
        defuseAssetId: 'nep141:wrap.near',
        symbol: 'wNEAR',
        decimals: 24,
        blockchain: 'near',
        price: '36.730692',
    };
    const usdc: AssetRegistryEntry = {
        assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        defuseAssetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        symbol: 'USDC',
        decimals: 6,
        blockchain: 'near',
        price: '1',
    };

    it('accepts a NEAR-to-USDC quote after normalizing 24 decimals to 6', () => {
        const quote = nearToUsdcQuote('365524');

        expect(() => policy.assertWithinTolerance(quote, near, usdc, 50)).not.toThrow();
    });

    it('rejects a NEAR-to-USDC quote below the normalized minimum', () => {
        const quote = nearToUsdcQuote('365469');

        expect(() => policy.assertWithinTolerance(quote, near, usdc, 50)).toThrow(
            expect.objectContaining({
                code: 'SLIPPAGE_EXCEEDED',
                details: expect.objectContaining({ minAcceptableOut: '365470' }),
            }) satisfies Partial<SwapValidationError>,
        );
    });

    function nearToUsdcQuote(amountOut: string): SwapQuote {
        return {
            providerId: 'one-click',
            executionMode: 'intent_sign',
            quoteHashes: ['quote-hash'],
            originAsset: near.assetId,
            destinationAsset: usdc.assetId,
            amountIn: '10000000000000000000000',
            amountOut,
            expirationTime: '2099-01-01T00:00:00.000Z',
        };
    }
});
