import { OneClickQuoteProvider } from './one-click-quote.provider';
import { OneClickApiHttpClient } from '../../../../http-clients/one-click-api/one-click-api.http-client';
import { SwapQuoteCommand } from '../../domain/models/swap-quote-request';

describe('OneClickQuoteProvider', () => {
    const command: SwapQuoteCommand = {
        originAsset: 'nep141:wrap.near',
        destinationAsset: 'nep141:usdt.tether-token.near',
        amount: '1000000',
        swapType: 'EXACT_INPUT',
        slippageTolerance: 100,
        deadline: new Date(Date.now() + 60_000).toISOString(),
        signerId: 'alice.near',
        authMethod: 'near',
    };

    it('maps 1Click quote response into a normalized provider quote', async () => {
        const client = {
            createQuote: jest.fn().mockResolvedValue({
                quote: {
                    amountIn: '1000000',
                    amountOut: '999000',
                    deadline: command.deadline,
                    quoteId: 'quote-1',
                    signature: 'sig-1',
                },
            }),
        } as unknown as OneClickApiHttpClient;

        const provider = new OneClickQuoteProvider(client);
        const quotes = await provider.requestQuotes(command);

        expect(client.createQuote).toHaveBeenCalledWith(
            expect.objectContaining({
                dry: true,
                originAsset: command.originAsset,
                destinationAsset: command.destinationAsset,
                depositType: 'INTENTS',
                recipientType: 'INTENTS',
            }),
        );
        expect(quotes).toEqual([
            expect.objectContaining({
                providerId: 'one-click',
                executionMode: 'deposit_address',
                amountIn: '1000000',
                amountOut: '999000',
                providerMeta: {
                    quoteId: 'quote-1',
                    signature: 'sig-1',
                    depositAddress: undefined,
                },
            }),
        ]);
    });

    it('maps quote hashes when 1Click exposes them for intent-sign execution', async () => {
        const client = {
            createQuote: jest.fn().mockResolvedValue({
                quote_hash: '0xabc',
                amountIn: '1000000',
                amountOut: '999000',
                deadline: command.deadline,
            }),
        } as unknown as OneClickApiHttpClient;

        const provider = new OneClickQuoteProvider(client);
        const quotes = await provider.requestQuotes(command);

        expect(quotes[0]).toMatchObject({
            executionMode: 'intent_sign',
            quoteHashes: ['0xabc'],
        });
    });
});
