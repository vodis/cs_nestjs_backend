import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrepareSwapUseCase } from './prepare-swap.use-case';
import { AssetRegistryPort } from '../ports/asset-registry.port';
import { QuoteProviderPort } from '../ports/quote-provider.port';
import { SwapQuoteCommand } from '../../domain/models/swap-quote-request';

describe('PrepareSwapUseCase', () => {
    const command: SwapQuoteCommand = {
        originAsset: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
        destinationAsset: 'nep141:wrap.near',
        amount: '1000000',
        swapType: 'EXACT_INPUT',
        slippageTolerance: 100,
        deadline: new Date(Date.now() + 60_000).toISOString(),
        signerId: '0x380b8fa1ebfe8a652dbb55c5a7dec2c683bbd8b9',
        authMethod: 'evm',
    };

    const assetRegistry: AssetRegistryPort = {
        findById: jest.fn(async (assetId: string) => ({
            assetId,
            defuseAssetId: assetId,
            symbol: assetId.includes('wrap') ? 'wNEAR' : 'USDC',
            decimals: assetId.includes('wrap') ? 24 : 6,
            blockchain: assetId.includes('wrap') ? 'near' : 'eth',
            price: assetId.includes('wrap') ? '2.5' : '1',
        })),
    };

    const configService = {
        get: jest.fn((key: string) => (key === 'SWAP_MAX_SLIPPAGE_BPS' ? 1000 : undefined)),
    } as unknown as ConfigService;

    const createUseCase = (providers: QuoteProviderPort[]) =>
        new PrepareSwapUseCase(assetRegistry, providers, configService);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('aggregates quotes from multiple providers and returns the best approved package', async () => {
        const providers: QuoteProviderPort[] = [
            {
                providerId: 'one-click',
                requestQuotes: jest.fn().mockResolvedValue([
                    {
                        providerId: 'one-click',
                        executionMode: 'deposit_address',
                        quoteHashes: [],
                        originAsset: command.originAsset,
                        destinationAsset: command.destinationAsset,
                        amountIn: '1000000',
                        amountOut: '2000000000000000000000000',
                        expirationTime: command.deadline,
                    },
                ]),
            },
            {
                providerId: 'solver-relay',
                requestQuotes: jest.fn().mockResolvedValue([
                    {
                        providerId: 'solver-relay',
                        executionMode: 'intent_sign',
                        quoteHashes: ['0xquote-hash'],
                        originAsset: command.originAsset,
                        destinationAsset: command.destinationAsset,
                        amountIn: '1000000',
                        amountOut: '2500000000000000000000000',
                        expirationTime: command.deadline,
                    },
                ]),
            },
        ];

        const result = await createUseCase(providers).execute(command);

        expect(result.providerId).toBe('solver-relay');
        expect(result.quoteHashes).toEqual(['0xquote-hash']);
        expect(result.tokenDeltas).toEqual({
            [command.originAsset]: '-1000000',
            [command.destinationAsset]: '2500000000000000000000000',
        });
        expect(result.signatureStandard).toBe('erc191');
    });

    it('continues when one provider fails and another succeeds', async () => {
        const providers: QuoteProviderPort[] = [
            {
                providerId: 'one-click',
                requestQuotes: jest.fn().mockRejectedValue(new Error('upstream down')),
            },
            {
                providerId: 'solver-relay',
                requestQuotes: jest.fn().mockResolvedValue([
                    {
                        providerId: 'solver-relay',
                        executionMode: 'intent_sign',
                        quoteHashes: ['0xquote-hash'],
                        originAsset: command.originAsset,
                        destinationAsset: command.destinationAsset,
                        amountIn: '1000000',
                        amountOut: '2500000000000000000000000',
                        expirationTime: command.deadline,
                    },
                ]),
            },
        ];

        const result = await createUseCase(providers).execute(command);

        expect(result.providerId).toBe('solver-relay');
    });

    it('throws when all providers fail', async () => {
        const providers: QuoteProviderPort[] = [
            {
                providerId: 'one-click',
                requestQuotes: jest.fn().mockRejectedValue(new Error('upstream down')),
            },
            {
                providerId: 'solver-relay',
                requestQuotes: jest.fn().mockRejectedValue(new Error('upstream down')),
            },
        ];

        await expect(createUseCase(providers).execute(command)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
});
