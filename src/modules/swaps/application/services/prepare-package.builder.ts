import { ApprovedPreparePackage } from '../../domain/models/approved-prepare-package';
import { SwapQuote } from '../../domain/models/swap-quote';
import { SwapQuoteCommand } from '../../domain/models/swap-quote-request';

export class PreparePackageBuilder {
    build(command: SwapQuoteCommand, quote: SwapQuote): ApprovedPreparePackage {
        const tokenDeltas = this.buildTokenDeltas(
            quote.originAsset,
            quote.destinationAsset,
            quote.amountIn,
            quote.amountOut,
        );

        return {
            quoteHashes: quote.quoteHashes,
            tokenDeltas,
            intents: [{ intent: 'token_diff', diff: tokenDeltas }],
            signerId: command.signerId,
            deadline: command.deadline,
            authMethod: command.authMethod,
            signatureStandard: command.authMethod === 'near' ? 'nep413' : 'erc191',
            originAsset: quote.originAsset,
            destinationAsset: quote.destinationAsset,
            amountIn: quote.amountIn,
            amountOut: quote.amountOut,
            slippageTolerance: command.slippageTolerance,
            quoteExpiration: quote.expirationTime,
            providerId: quote.providerId,
        };
    }

    private buildTokenDeltas(
        originAsset: string,
        destinationAsset: string,
        amountIn: string,
        amountOut: string,
    ): Record<string, string> {
        return {
            [originAsset]: `-${amountIn}`,
            [destinationAsset]: amountOut,
        };
    }
}
