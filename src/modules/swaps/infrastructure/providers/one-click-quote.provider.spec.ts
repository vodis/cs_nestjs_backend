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
        depositType: 'INTENTS',
        refundType: 'INTENTS',
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
            generateIntent: jest.fn().mockResolvedValue({
                intent: {
                    standard: 'nep413',
                    payload: { message: 'generated-message', nonce: 'nonce', recipient: 'intents.near' },
                },
                correlationId: 'intent-correlation-1',
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
        expect(client.generateIntent).toHaveBeenCalledWith({
            type: 'swap_transfer',
            standard: 'nep413',
            signerId: command.signerId,
            depositAddress: 'one-click-deposit.near',
        });
        expect(quotes).toEqual([
            expect.objectContaining({
                providerId: 'one-click',
                executionMode: 'intent_sign',
                quoteHashes: [],
                amountIn: '1000000',
                amountOut: '999000',
                executionPackage: {
                    providerId: 'one-click',
                    mode: 'intent_sign',
                    protocol: 'near-intents',
                    requiredAction: 'sign',
                    payload: {
                        intent: {
                            standard: 'nep413',
                            payload: { message: 'generated-message', nonce: 'nonce', recipient: 'intents.near' },
                        },
                        correlationId: 'intent-correlation-1',
                        depositAddress: 'one-click-deposit.near',
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
            generateIntent: jest.fn().mockResolvedValue({ intent: {}, correlationId: 'correlation-1' }),
        } as unknown as OneClickApiHttpClient;
        const provider = new OneClickQuoteProvider(client);

        await provider.requestQuotes(command);

        expect(client.createQuote).toHaveBeenCalledWith(expect.objectContaining({ dry: false }));
    });

    it.each([
        ['near', 'alice.near', 'INTENTS'],
        ['evm', '0x380b8fa1ebfe8a652dbb55c5a7dec2c683bbd8b9', 'ORIGIN_CHAIN'],
    ] as const)('defaults omitted custody types for %s wallets', async (authMethod, signerId, accountType) => {
        const client = {
            createQuote: jest.fn().mockResolvedValue({ amountIn: '1000000', amountOut: '900000' }),
        } as unknown as OneClickApiHttpClient;
        const provider = new OneClickQuoteProvider(client);

        await provider.requestQuotes({
            ...command,
            signerId,
            recipient: signerId,
            authMethod,
            depositType: undefined,
            refundType: undefined,
        });

        expect(client.createQuote).toHaveBeenCalledWith(
            expect.objectContaining({
                depositType: accountType,
                refundType: accountType,
            }),
        );
    });

    it('preserves an origin-chain route for a NEAR wallet swap', async () => {
        const client = {
            createQuote: jest.fn().mockResolvedValue({ amountIn: '1000000', amountOut: '900000' }),
        } as unknown as OneClickApiHttpClient;
        const provider = new OneClickQuoteProvider(client);

        await provider.requestQuotes({
            ...command,
            recipientType: 'DESTINATION_CHAIN',
            depositType: 'ORIGIN_CHAIN',
            refundType: 'ORIGIN_CHAIN',
        });

        expect(client.createQuote).toHaveBeenCalledWith(
            expect.objectContaining({
                depositType: 'ORIGIN_CHAIN',
                recipientType: 'DESTINATION_CHAIN',
                refundType: 'ORIGIN_CHAIN',
            }),
        );
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

    it('uses 1Click generated intent instead of relying on quote hashes', async () => {
        const client = {
            createQuote: jest.fn().mockResolvedValue({
                amountIn: '1000000',
                amountOut: '999000',
                deadline: command.deadline,
                depositAddress: 'one-click-deposit.near',
            }),
            generateIntent: jest.fn().mockResolvedValue({
                intent: { standard: 'nep413', payload: { message: 'exact-provider-message' } },
                correlationId: 'correlation-1',
            }),
        } as unknown as OneClickApiHttpClient;

        const provider = new OneClickQuoteProvider(client);
        const quotes = await provider.requestQuotes(command);

        expect(quotes[0]).toMatchObject({
            executionMode: 'intent_sign',
            quoteHashes: [],
            executionPackage: {
                mode: 'intent_sign',
                payload: {
                    intent: { standard: 'nep413', payload: { message: 'exact-provider-message' } },
                },
            },
        });
    });

    it('keeps origin-chain quotes on the deposit-address execution path', async () => {
        const client = {
            createQuote: jest.fn().mockResolvedValue({
                amountIn: '1000000',
                amountOut: '999000',
                deadline: command.deadline,
                depositAddress: 'one-click-deposit.near',
            }),
            generateIntent: jest.fn(),
        } as unknown as OneClickApiHttpClient;

        const provider = new OneClickQuoteProvider(client);
        const quotes = await provider.requestQuotes({
            ...command,
            depositType: 'ORIGIN_CHAIN',
            refundType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
        });

        expect(client.generateIntent).not.toHaveBeenCalled();
        expect(quotes[0]).toMatchObject({
            executionMode: 'deposit_address',
            executionPackage: {
                mode: 'deposit_address',
                requiredAction: 'deposit',
                payload: { depositAddress: 'one-click-deposit.near' },
            },
        });
    });

    it('rejects an invalid generated intent response', async () => {
        const client = {
            createQuote: jest.fn().mockResolvedValue({
                amountIn: '1000000',
                amountOut: '999000',
                depositAddress: 'one-click-deposit.near',
            }),
            generateIntent: jest.fn().mockResolvedValue({ intent: undefined, correlationId: 'correlation-1' }),
        } as unknown as OneClickApiHttpClient;

        await expect(new OneClickQuoteProvider(client).requestQuotes(command)).rejects.toMatchObject({
            response: expect.objectContaining({ code: 'INVALID_ONE_CLICK_INTENT_RESPONSE' }),
        });
    });
});
