import { BadGatewayException, Injectable } from '@nestjs/common';
import {
    OneClickApiHttpClient,
    OneClickIntentStandard,
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
    depositAddress?: string;
    deposit_address?: string;
};

type OneClickQuoteResponse = {
    quote?: OneClickQuotePayload;
    correlationId?: string;
    signature?: string;
} & OneClickQuotePayload;

@Injectable()
export class OneClickQuoteProvider implements QuoteProviderPort {
    readonly providerId = 'one-click';
    readonly supportsExternalRecipient = true;

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

        const depositAddress = quote.depositAddress ?? quote.deposit_address;
        const isIntentDeposit = (command.depositType ?? this.defaultAccountType(command)) === 'INTENTS';
        const generatedIntent =
            isIntentDeposit && depositAddress
                ? await this.oneClickApiHttpClient.generateIntent({
                      type: 'swap_transfer',
                      standard: this.signatureStandard(command),
                      signerId: command.signerId,
                      depositAddress,
                  })
                : undefined;
        if (
            generatedIntent &&
            (!generatedIntent.intent ||
                typeof generatedIntent.intent !== 'object' ||
                Array.isArray(generatedIntent.intent))
        ) {
            throw new BadGatewayException({
                code: 'INVALID_ONE_CLICK_INTENT_RESPONSE',
                message: '1Click did not return a valid intent payload',
            });
        }
        const executionMode = isIntentDeposit ? 'intent_sign' : 'deposit_address';

        const expirationTime = quote.deadline ?? quote.expiration_time ?? command.deadline;
        const providerMeta = {
            protocol: '1click',
            quoteId: quote.quoteId ?? quote.quote_id ?? response.correlationId,
            signature: quote.signature ?? response.signature,
            depositAddress,
        };

        return [
            {
                providerId: this.providerId,
                executionMode,
                quoteHashes: [],
                originAsset: command.originAsset,
                destinationAsset: command.destinationAsset,
                amountIn,
                amountOut,
                expirationTime,
                executionPackage: generatedIntent
                    ? {
                          providerId: this.providerId,
                          mode: 'intent_sign',
                          protocol: 'near-intents',
                          requiredAction: 'sign',
                          payload: {
                              intent: generatedIntent.intent,
                              correlationId: generatedIntent.correlationId,
                              depositAddress,
                          },
                      }
                    : depositAddress
                      ? {
                            providerId: this.providerId,
                            mode: 'deposit_address',
                            protocol: '1click',
                            requiredAction: 'deposit',
                            payload: {
                                quoteId: providerMeta.quoteId,
                                depositAddress,
                                expiresAt: expirationTime,
                            },
                        }
                      : undefined,
                providerMeta,
            },
        ];
    }

    private toOneClickQuoteRequest(command: SwapQuoteCommand): OneClickQuoteRequest {
        const accountType = this.defaultAccountType(command);

        return {
            dry: false,
            swapType: command.swapType,
            slippageTolerance: command.slippageTolerance,
            originAsset: command.originAsset,
            depositType: command.depositType ?? accountType,
            destinationAsset: command.destinationAsset,
            amount: command.amount,
            recipient: command.recipient,
            recipientType: command.recipientType,
            refundTo: command.signerId,
            refundType: command.refundType ?? accountType,
            deadline: command.deadline,
        };
    }

    private defaultAccountType(command: SwapQuoteCommand): 'INTENTS' | 'ORIGIN_CHAIN' {
        return command.authMethod === 'near' ? 'INTENTS' : 'ORIGIN_CHAIN';
    }

    private signatureStandard(command: SwapQuoteCommand): OneClickIntentStandard {
        return command.authMethod === 'near' ? 'nep413' : 'erc191';
    }
}
