import { SwapQuote } from '../../domain/models/swap-quote';
import { SwapQuoteCommand } from '../../domain/models/swap-quote-request';

export const QUOTE_PROVIDERS = Symbol('QUOTE_PROVIDERS');

export interface QuoteProviderPort {
    readonly providerId: string;

    requestQuotes(command: SwapQuoteCommand): Promise<SwapQuote[]>;
}
