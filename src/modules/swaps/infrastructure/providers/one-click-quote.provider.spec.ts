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
        recipient: 'alice.near',
        recipientType: 'INTENTS',
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
                    depositAddress: 'one-click-deposit.near',
                },
            }),
        } as unknown as OneClickApiHttpClient;

        const provider = new OneClickQuoteProvider(client);
        const quotes = await provider.requestQuotes(command);

        expect(client.createQuote).toHaveBeenCalledWith(
            expect.objectContaining({
                dry: false,
                originAsset: command.originAsset,
                destinationAsset: command.destinationAsset,
                depositType: 'INTENTS',
                recipientType: 'INTENTS',
                recipient: command.recipient,
            }),
        );
        expect(quotes).toEqual([
            expect.objectContaining({
                providerId: 'one-click',
                executionMode: 'deposit_address',
                amountIn: '1000000',
                amountOut: '999000',
                executionPackage: {
                    providerId: 'one-click',
                    mode: 'deposit_address',
                    protocol: '1click',
                    requiredAction: 'deposit',
                    payload: {
                        quoteId: 'quote-1',
                        depositAddress: 'one-click-deposit.near',
                        expiresAt: command.deadline,
                    },
                },
                providerMeta: expect.objectContaining({
                    protocol: '1click',
                    quoteId: 'quote-1',
                    signature: 'sig-1',
                    depositAddress: 'one-click-deposit.near',
                }),
            }),
        ]);
    });

    it('requests an executable quote during prepare instead of a dry estimate', async () => {
        const client = {
            createQuote: jest.fn().mockResolvedValue({
                amountIn: '1000000',
                amountOut: '900000',
                depositAddress: 'one-click-deposit.near',
            }),
        } as unknown as OneClickApiHttpClient;
        const provider = new OneClickQuoteProvider(client);

        await provider.requestQuotes(command);

        expect(client.createQuote).toHaveBeenCalledWith(expect.objectContaining({ dry: false }));
    });

    it('keeps a foreign destination recipient separate from the signer refund address', async () => {
        const client = {
            createQuote: jest.fn().mockResolvedValue({ amountIn: '1000000', amountOut: '900000' }),
        } as unknown as OneClickApiHttpClient;
        const provider = new OneClickQuoteProvider(client);

        await provider.requestQuotes({
            ...command,
            recipient: 'BYPsjxa3YuZESQz1dKuBw1QSFCSpecsm8nCQhY5xbU1Z',
            recipientType: 'DESTINATION_CHAIN',
        });

        expect(client.createQuote).toHaveBeenCalledWith(
            expect.objectContaining({
                recipient: 'BYPsjxa3YuZESQz1dKuBw1QSFCSpecsm8nCQhY5xbU1Z',
                recipientType: 'DESTINATION_CHAIN',
                refundTo: 'alice.near',
                refundType: 'INTENTS',
            }),
        );
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
