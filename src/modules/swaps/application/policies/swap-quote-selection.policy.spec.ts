import { SwapQuoteSelectionPolicy } from './swap-quote-selection.policy';
import { SwapQuote } from '../../domain/models/swap-quote';

describe('SwapQuoteSelectionPolicy', () => {
    const policy = new SwapQuoteSelectionPolicy();

    const baseQuote = (overrides: Partial<SwapQuote>): SwapQuote => ({
        providerId: 'solver-relay',
        executionMode: 'intent_sign',
        quoteHashes: ['hash-a'],
        originAsset: 'nep141:a.near',
        destinationAsset: 'nep141:b.near',
        amountIn: '1000',
        amountOut: '900',
        expirationTime: '2026-06-11T12:00:00.000Z',
        ...overrides,
    });

    it('selects the best executable quote for EXACT_INPUT', () => {
        const selected = policy.selectBestExecutableQuote(
            [
                baseQuote({ providerId: 'one-click', amountOut: '950', quoteHashes: [] }),
                baseQuote({ providerId: 'solver-relay', amountOut: '980', quoteHashes: ['hash-better'] }),
                baseQuote({ providerId: 'solver-relay', amountOut: '970', quoteHashes: ['hash-worse'] }),
            ],
            'EXACT_INPUT',
        );

        expect(selected.amountOut).toBe('980');
        expect(selected.quoteHashes).toEqual(['hash-better']);
    });

    it('selects deposit-address quotes when they are the best executable option', () => {
        const selected = policy.selectBestExecutableQuote(
            [
                baseQuote({
                    providerId: 'one-click',
                    executionMode: 'deposit_address',
                    quoteHashes: [],
                    amountOut: '990',
                    providerMeta: { depositAddress: 'one-click-deposit.near' },
                }),
                baseQuote({ providerId: 'solver-relay', amountOut: '980', quoteHashes: ['hash-better'] }),
            ],
            'EXACT_INPUT',
        );

        expect(selected.providerId).toBe('one-click');
        expect(selected.executionMode).toBe('deposit_address');
    });

    it('rejects when no provider returns an executable package', () => {
        expect(() =>
            policy.selectBestExecutableQuote(
                [baseQuote({ executionMode: 'deposit_address', quoteHashes: [] })],
                'EXACT_INPUT',
            ),
        ).toThrow('No executable solver quotes available for this swap');
    });
});
