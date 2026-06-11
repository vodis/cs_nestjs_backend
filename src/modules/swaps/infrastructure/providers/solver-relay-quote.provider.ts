import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    SolverQuoteRequest,
    SolverRelayApiHttpClient,
} from '../../../../http-clients/solver-relay-api/solver-relay-api.http-client';
import { QuoteProviderPort } from '../../application/ports/quote-provider.port';
import { SwapQuote } from '../../domain/models/swap-quote';
import { SwapQuoteCommand } from '../../domain/models/swap-quote-request';

@Injectable()
export class SolverRelayQuoteProvider implements QuoteProviderPort {
    readonly providerId = 'solver-relay';

    constructor(
        private readonly solverRelayApiHttpClient: SolverRelayApiHttpClient,
        private readonly configService: ConfigService,
    ) {}

    async requestQuotes(command: SwapQuoteCommand): Promise<SwapQuote[]> {
        const params: SolverQuoteRequest = {
            defuse_asset_identifier_in: command.originAsset,
            defuse_asset_identifier_out: command.destinationAsset,
            min_deadline_ms: command.minDeadlineMs ?? this.getDefaultMinDeadlineMs(),
        };

        if (command.swapType === 'EXACT_INPUT') {
            params.exact_amount_in = command.amount;
        } else {
            params.exact_amount_out = command.amount;
        }

        const quotes = await this.solverRelayApiHttpClient.requestQuotes(params);

        return quotes.map((quote) => ({
            providerId: this.providerId,
            executionMode: 'intent_sign',
            quoteHashes: [quote.quote_hash],
            originAsset: quote.defuse_asset_identifier_in,
            destinationAsset: quote.defuse_asset_identifier_out,
            amountIn: quote.amount_in,
            amountOut: quote.amount_out,
            expirationTime: quote.expiration_time,
        }));
    }

    private getDefaultMinDeadlineMs(): number {
        const configured = Number(this.configService.get('SWAP_MIN_DEADLINE_MS') || 60000);
        return Number.isFinite(configured) && configured >= 1000 ? configured : 60000;
    }
}
