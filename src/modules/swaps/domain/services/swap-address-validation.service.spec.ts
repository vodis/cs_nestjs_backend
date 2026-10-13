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

    it.each(['INTENTS', 'CONFIDENTIAL_INTENTS'] as const)(
        'accepts an EVM implicit account as a %s recipient',
        (recipientType) => {
            expect(() =>
                service.assertExternalRecipient('0x380b8fa1ebfe8a652dbb55c5a7dec2c683bbd8b9', recipientType, 'near'),
            ).not.toThrow();
            expect(() => service.assertExternalRecipient('0xnot-an-address', recipientType, 'near')).toThrow(
                expect.objectContaining({ code: 'INVALID_RECIPIENT' }),
            );
        },
    );

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

describe('destination memo policy', () => {
    const validation = new SwapAddressValidationService();
    it.each(['0', '4294967295'])('accepts XRP uint32 tag %s', (memo) => {
        expect(() => validation.assertDestinationMemo('xrp', 'DESTINATION_CHAIN', memo)).not.toThrow();
    });
    it.each(['4294967296', '-1', '1.5', '01', '', ' 1'])('rejects malformed or overflowing tag %s', (memo) => {
        expect(() => validation.assertDestinationMemo('xrp', 'DESTINATION_CHAIN', memo)).toThrow();
    });
    it('rejects destination tags on other chains and internal recipients', () => {
        expect(() => validation.assertDestinationMemo('stellar', 'DESTINATION_CHAIN', '1')).toThrow();
        expect(() => validation.assertDestinationMemo('xrp', 'INTENTS', '1')).toThrow();
    });
});

it('validates Quantus SS58 network and checksum', () => {
    const validation = new SwapAddressValidationService();
    const address = 'qzk1Nxai3dZD9Cn5kwGcgL6mKxsfxwqdis7kDQJ52aJS2vSn7';
    expect(() => validation.assertExternalRecipient(address, 'DESTINATION_CHAIN', 'qtc')).not.toThrow();
    expect(() => validation.assertExternalRecipient(address.slice(0, -1) + '8', 'DESTINATION_CHAIN', 'qtc')).toThrow();
});
