import { Injectable } from '@nestjs/common';
import {
    OneClickApiHttpClient,
    OneClickQuoteRequest,
} from '../../../../http-clients/one-click-api/one-click-api.http-client';
import { QuoteProviderPort } from '../../application/ports/quote-provider.port';
import { SwapQuote } from '../../domain/models/swap-quote';
import { SwapQuoteCommand } from '../../domain/models/swap-quote-request';

type OneClickQuotePayload = {
    quoteId?: string;
    quote_id?: string;
    amountIn?: string;
    amount_in?: string;
    amountOut?: string;
    amount_out?: string;
    deadline?: string;
    expiration_time?: string;
    signature?: string;
    quote_hash?: string;
    quote_hashes?: string[];
    depositAddress?: string;
    deposit_address?: string;
};

type OneClickQuoteResponse = {
    quote?: OneClickQuotePayload;
} & OneClickQuotePayload;

@Injectable()
export class OneClickQuoteProvider implements QuoteProviderPort {
    readonly providerId = 'one-click';

    constructor(private readonly oneClickApiHttpClient: OneClickApiHttpClient) {}

    async requestQuotes(command: SwapQuoteCommand): Promise<SwapQuote[]> {
        const response = (await this.oneClickApiHttpClient.createQuote(
            this.toOneClickQuoteRequest(command),
        )) as OneClickQuoteResponse;

        const quote = response.quote ?? response;
        const amountIn = quote.amountIn ?? quote.amount_in;
        const amountOut = quote.amountOut ?? quote.amount_out;

        if (!amountIn || !amountOut) {
            return [];
        }

        const quoteHashes = this.extractQuoteHashes(quote);
        const depositAddress = quote.depositAddress ?? quote.deposit_address;
        const executionMode = quoteHashes.length > 0 ? 'intent_sign' : 'deposit_address';

        return [
            {
                providerId: this.providerId,
                executionMode,
                quoteHashes,
                originAsset: command.originAsset,
                destinationAsset: command.destinationAsset,
                amountIn,
                amountOut,
                expirationTime: quote.deadline ?? quote.expiration_time ?? command.deadline,
                providerMeta: {
                    quoteId: quote.quoteId ?? quote.quote_id,
                    signature: quote.signature,
                    depositAddress,
                },
            },
        ];
    }

    private toOneClickQuoteRequest(command: SwapQuoteCommand): OneClickQuoteRequest {
        const userAddressType = command.authMethod === 'near' ? 'INTENTS' : 'ORIGIN_CHAIN';
        const recipientType = command.authMethod === 'near' ? 'INTENTS' : 'DESTINATION_CHAIN';

        return {
            dry: true,
            swapType: command.swapType,
            slippageTolerance: command.slippageTolerance,
            originAsset: command.originAsset,
            depositType: command.authMethod === 'near' ? 'INTENTS' : 'ORIGIN_CHAIN',
            destinationAsset: command.destinationAsset,
            amount: command.amount,
            recipient: command.signerId,
            recipientType,
            refundTo: command.signerId,
            refundType: userAddressType,
            deadline: command.deadline,
        };
    }

    private extractQuoteHashes(quote: OneClickQuotePayload): string[] {
        if (Array.isArray(quote.quote_hashes) && quote.quote_hashes.length > 0) {
            return quote.quote_hashes.filter((hash): hash is string => typeof hash === 'string' && hash.length > 0);
        }

        if (typeof quote.quote_hash === 'string' && quote.quote_hash.length > 0) {
            return [quote.quote_hash];
        }

        return [];
    }
}
