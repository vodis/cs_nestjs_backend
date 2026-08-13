import { ApprovedPreparePackage } from '../../domain/models/approved-prepare-package';
import { SwapExecutionPackage, SwapQuote } from '../../domain/models/swap-quote';
import { SwapQuoteCommand } from '../../domain/models/swap-quote-request';

export class PreparePackageBuilder {
    build(command: SwapQuoteCommand, quote: SwapQuote): ApprovedPreparePackage {
        const tokenDeltas = this.buildTokenDeltas(
            quote.originAsset,
            quote.destinationAsset,
            quote.amountIn,
            quote.amountOut,
        );

        const intents = [{ intent: 'token_diff' as const, diff: tokenDeltas }];
        const signatureStandard = command.authMethod === 'near' ? 'nep413' : 'erc191';

        return {
            quoteHashes: quote.quoteHashes,
            tokenDeltas,
            intents,
            signerId: command.signerId,
            deadline: command.deadline,
            authMethod: command.authMethod,
            signatureStandard,
            originAsset: quote.originAsset,
            destinationAsset: quote.destinationAsset,
            amountIn: quote.amountIn,
            amountOut: quote.amountOut,
            slippageTolerance: command.slippageTolerance,
            quoteExpiration: quote.expirationTime,
            providerId: quote.providerId,
            executionPackage:
                quote.executionPackage ??
                this.buildDefaultExecutionPackage(command, quote, tokenDeltas, intents, signatureStandard),
        };
    }

    private buildDefaultExecutionPackage(
        command: SwapQuoteCommand,
        quote: SwapQuote,
        tokenDeltas: Record<string, string>,
        intents: { intent: 'token_diff'; diff: Record<string, string> }[],
        signatureStandard: 'erc191' | 'nep413',
    ): SwapExecutionPackage {
        if (quote.executionMode === 'deposit_address') {
            return {
                providerId: quote.providerId,
                mode: 'deposit_address',
                protocol: String(quote.providerMeta?.protocol ?? quote.providerId),
                requiredAction: 'deposit',
                payload: {
                    quoteId: quote.providerMeta?.quoteId,
                    depositAddress: quote.providerMeta?.depositAddress,
                    expiresAt: quote.expirationTime,
                },
            };
        }

        return {
            providerId: quote.providerId,
            mode: 'intent_sign',
            protocol: 'near-intents',
            requiredAction: 'sign',
            payload: {
                quoteHashes: quote.quoteHashes,
                tokenDeltas,
                intents,
                signerId: command.signerId,
                deadline: command.deadline,
                deadlineTimestamp: new Date(command.deadline).getTime(),
                signatureStandard,
            },
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
