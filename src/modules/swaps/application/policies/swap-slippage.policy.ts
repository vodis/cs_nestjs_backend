import { SwapValidationError } from '../../domain/errors/swap-validation.error';
import { AssetRegistryEntry } from '../../domain/models/asset-registry-entry';
import { SwapQuote } from '../../domain/models/swap-quote';
import { getAtomicDecimalScale } from '../../../../utils/decimal.util';

const PRICE_RATIO_SCALE = 1_000_000;
const BASIS_POINTS_SCALE = 10_000;

export class SwapSlippagePolicy {
    assertWithinTolerance(
        quote: SwapQuote,
        originAsset: AssetRegistryEntry,
        destinationAsset: AssetRegistryEntry,
        slippageTolerance: number,
    ): void {
        const originPrice = this.toPositiveNumber(originAsset.price);
        const destinationPrice = this.toPositiveNumber(destinationAsset.price);

        if (!originPrice || !destinationPrice) {
            return;
        }

        const amountIn = BigInt(quote.amountIn);
        const amountOut = BigInt(quote.amountOut);

        if (amountIn <= 0n || amountOut <= 0n) {
            return;
        }

        const priceRatio = BigInt(Math.round((originPrice / destinationPrice) * PRICE_RATIO_SCALE));
        const decimalScale = getAtomicDecimalScale(originAsset.decimals, destinationAsset.decimals);
        const minAcceptableOut =
            (amountIn * priceRatio * BigInt(BASIS_POINTS_SCALE - slippageTolerance) * decimalScale.multiplier) /
            (BigInt(PRICE_RATIO_SCALE * BASIS_POINTS_SCALE) * decimalScale.divisor);

        if (amountOut < minAcceptableOut) {
            throw new SwapValidationError('SLIPPAGE_EXCEEDED', 'Best quote exceeds the requested slippage tolerance', {
                providerId: quote.providerId,
                amountOut: quote.amountOut,
                minAcceptableOut: minAcceptableOut.toString(),
                slippageTolerance,
            });
        }
    }

    private toPositiveNumber(value: string | number | undefined): number | undefined {
        const parsed = typeof value === 'number' ? value : Number(value);

        if (!Number.isFinite(parsed) || parsed <= 0) {
            return undefined;
        }

        return parsed;
    }
}
