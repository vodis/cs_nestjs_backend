import { SwapValidationError } from '../../domain/errors/swap-validation.error';
import { SwapQuote } from '../../domain/models/swap-quote';
import { SwapType } from '../../domain/models/swap-quote-request';

export class SwapQuoteSelectionPolicy {
    selectBestExecutableQuote(quotes: SwapQuote[], swapType: SwapType): SwapQuote {
        const executableQuotes = quotes.filter((quote) => this.isExecutable(quote));

        if (!executableQuotes.length) {
            throw new SwapValidationError(
                'INSUFFICIENT_LIQUIDITY',
                'No executable solver quotes available for this swap',
                {
                    providerCount: quotes.length,
                },
            );
        }

        const sorted = [...executableQuotes].sort((left, right) => {
            const leftValue = BigInt(swapType === 'EXACT_INPUT' ? left.amountOut : left.amountIn);
            const rightValue = BigInt(swapType === 'EXACT_INPUT' ? right.amountOut : right.amountIn);
            return leftValue > rightValue ? -1 : leftValue < rightValue ? 1 : 0;
        });

        return sorted[0];
    }

    private isExecutable(quote: SwapQuote): boolean {
        if (quote.executionPackage) {
            return Boolean(quote.executionPackage.requiredAction && quote.executionPackage.payload);
        }

        if (quote.executionMode === 'intent_sign') {
            return quote.quoteHashes.length > 0;
        }

        if (quote.executionMode === 'deposit_address') {
            return (
                typeof quote.providerMeta?.depositAddress === 'string' && quote.providerMeta.depositAddress.length > 0
            );
        }

        return false;
    }
}
