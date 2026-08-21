import { SwapAddressValidationService } from './swap-address-validation.service';

describe('SwapAddressValidationService recipient validation', () => {
    const service = new SwapAddressValidationService();

    it('accepts recipients that match their destination network', () => {
        expect(() =>
            service.assertExternalRecipient('BYPsjxa3YuZESQz1dKuBw1QSFCSpecsm8nCQhY5xbU1Z', 'DESTINATION_CHAIN', 'sol'),
        ).not.toThrow();
        expect(() =>
            service.assertExternalRecipient('0x380b8fa1ebfe8a652dbb55c5a7dec2c683bbd8b9', 'DESTINATION_CHAIN', 'base'),
        ).not.toThrow();
    });

    it('rejects a recipient that does not match the destination network', () => {
        expect(() =>
            service.assertExternalRecipient('0x380b8fa1ebfe8a652dbb55c5a7dec2c683bbd8b9', 'DESTINATION_CHAIN', 'sol'),
        ).toThrow(expect.objectContaining({ code: 'INVALID_RECIPIENT' }));
    });

    it('fails closed for destination networks without an address validator', () => {
        expect(() => service.assertExternalRecipient('future-address', 'DESTINATION_CHAIN', 'future-chain')).toThrow(
            expect.objectContaining({ code: 'UNSUPPORTED_RECIPIENT_NETWORK' }),
        );
    });

    it('compares EVM addresses without checksum casing differences', () => {
        expect(
            service.areEquivalent(
                'evm',
                '0x380B8Fa1eBFe8a652Dbb55c5a7DEc2C683BbD8b9',
                '0x380b8fa1ebfe8a652dbb55c5a7dec2c683bbd8b9',
            ),
        ).toBe(true);
    });
});
