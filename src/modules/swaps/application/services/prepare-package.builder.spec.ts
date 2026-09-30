import { PreparePackageBuilder } from './prepare-package.builder';
import { SwapQuoteCommand } from '../../domain/models/swap-quote-request';
import { SwapQuote } from '../../domain/models/swap-quote';

describe('PreparePackageBuilder Sep 30 swap regression', () => {
    const command: SwapQuoteCommand = {
        originAsset: 'nep141:wrap.near',
        destinationAsset: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        amount: '10000000000000000000000',
        swapType: 'EXACT_INPUT',
        slippageTolerance: 50,
        deadline: '2026-09-30T08:57:53.074Z',
        signerId: 'vodis_craftscript.tg',
        recipient: 'vodis_craftscript.tg',
        recipientType: 'DESTINATION_CHAIN',
        depositType: 'ORIGIN_CHAIN',
        refundType: 'ORIGIN_CHAIN',
        authMethod: 'near',
    };
    const quote: SwapQuote = {
        providerId: 'one-click',
        executionMode: 'deposit_address',
        quoteHashes: [],
        originAsset: command.originAsset,
        destinationAsset: command.destinationAsset,
        amountIn: command.amount,
        amountOut: '50446',
        expirationTime: '2026-10-03T08:57:53.074Z',
        providerMeta: { depositAddress: 'deposit.near' },
    };

    it('caps preparation lifetime at the requested deadline and preserves atomic amounts and bps', () => {
        const result = new PreparePackageBuilder().build(command, quote);
        expect(result.quoteExpiration).toBe(command.deadline);
        expect(result.amountIn).toBe('10000000000000000000000');
        expect(result.amountOut).toBe('50446');
        expect(result.slippageTolerance).toBe(50);
    });

    it('preserves an earlier provider expiry', () => {
        const expirationTime = '2026-09-30T08:50:00.000Z';
        expect(new PreparePackageBuilder().build(command, { ...quote, expirationTime }).quoteExpiration).toBe(
            expirationTime,
        );
    });
});
