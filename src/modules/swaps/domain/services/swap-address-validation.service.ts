import { SwapValidationError } from '../errors/swap-validation.error';
import { SwapAuthMethod } from '../models/swap-quote-request';

const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const NEAR_ACCOUNT_PATTERN = /^[a-z0-9._-]+\.(?:near|testnet|tg)$/i;
const NEAR_IMPLICIT_ACCOUNT_PATTERN = /^[a-f0-9]{64}$/i;
const BASE58_PATTERN = '[1-9A-HJ-NP-Za-km-z]';
const EVM_BLOCKCHAINS = new Set([
    'eth',
    'base',
    'arb',
    'gnosis',
    'bera',
    'bsc',
    'pol',
    'op',
    'avax',
    'xlayer',
    'monad',
    'plasma',
    'scroll',
]);

const DESTINATION_ADDRESS_PATTERNS: Record<string, RegExp> = {
    near: new RegExp(`(?:${NEAR_ACCOUNT_PATTERN.source}|${NEAR_IMPLICIT_ACCOUNT_PATTERN.source})`, 'i'),
    sol: new RegExp(`^${BASE58_PATTERN}{32,44}$`),
    btc: /^(?:[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[ac-hj-np-z02-9]{11,87})$/i,
    doge: new RegExp(`^[DA9]${BASE58_PATTERN}{25,34}$`),
    zec: new RegExp(`^t[13]${BASE58_PATTERN}{20,}$`),
    bch: /^(?:[13][1-9A-HJ-NP-Za-km-z]{25,34}|(?:bitcoincash:)?[qp][a-z0-9]{41,})$/i,
    ltc: /^(?:[LM3][1-9A-HJ-NP-Za-km-z]{25,34}|ltc1[ac-hj-np-z02-9]{11,87})$/i,
    dash: new RegExp(`^X${BASE58_PATTERN}{25,34}$`),
    xrp: new RegExp(`^(?:r${BASE58_PATTERN}{24,34}|X${BASE58_PATTERN}{40,})$`),
    tron: new RegExp(`^T${BASE58_PATTERN}{33}$`),
    ton: /^(?:EQ|UQ)[A-Za-z0-9_-]{46}$/,
    stellar: /^G[A-Z2-7]{55}$/,
    cardano: /^addr1[0-9a-z]{20,}$/,
    aleo: /^aleo1[0-9a-z]{58}$/,
    aptos: /^0x[a-fA-F0-9]{64}$/,
    sui: /^0x[a-fA-F0-9]{64}$/,
    starknet: /^0x[a-fA-F0-9]{1,64}$/,
};

export class SwapAddressValidationService {
    areEquivalent(authMethod: string, left: string, right: string): boolean {
        return authMethod === 'evm' || authMethod === 'near'
            ? left.toLowerCase() === right.toLowerCase()
            : left === right;
    }

    assertSupportedAuthMethod(authMethod: string): asserts authMethod is SwapAuthMethod {
        if (authMethod !== 'evm' && authMethod !== 'near') {
            throw new SwapValidationError(
                'UNSUPPORTED_AUTH_METHOD',
                'Only EVM and NEAR wallets are supported for 1Click quotes',
                { authMethod },
            );
        }
    }

    assertSignerAddress(authMethod: string, signerId: string): asserts authMethod is SwapAuthMethod {
        this.assertSupportedAuthMethod(authMethod);

        if (authMethod === 'evm' && !EVM_ADDRESS_PATTERN.test(signerId)) {
            throw new SwapValidationError('INVALID_SIGNER', 'EVM signerId must be a 0x-prefixed 20-byte address', {
                signerId,
            });
        }

        if (authMethod === 'near' && !NEAR_ACCOUNT_PATTERN.test(signerId)) {
            throw new SwapValidationError('INVALID_SIGNER', 'NEAR signerId must be a valid NEAR account id', {
                signerId,
            });
        }
    }

    assertRefundAddress(authMethod: string, refundTo: string): asserts authMethod is SwapAuthMethod {
        try {
            this.assertSignerAddress(authMethod, refundTo);
        } catch (error) {
            if (error instanceof SwapValidationError && error.code === 'INVALID_SIGNER') {
                throw new SwapValidationError(
                    'INVALID_REFUND_ADDRESS',
                    'Refund address is not valid for the selected wallet auth method',
                    { authMethod, refundTo },
                );
            }

            throw error;
        }
    }

    assertExternalRecipient(
        recipient: string,
        recipientType: 'DESTINATION_CHAIN' | 'INTENTS',
        destinationBlockchain: string,
    ): void {
        if (!recipient || recipient.trim() !== recipient || /\s/.test(recipient)) {
            throw new SwapValidationError(
                'INVALID_RECIPIENT',
                'Recipient must be a non-empty address without whitespace',
                {
                    recipient,
                },
            );
        }

        if (recipientType === 'INTENTS') {
            if (!NEAR_ACCOUNT_PATTERN.test(recipient) && !NEAR_IMPLICIT_ACCOUNT_PATTERN.test(recipient)) {
                throw new SwapValidationError(
                    'INVALID_RECIPIENT',
                    'INTENTS recipient must be a valid NEAR account id',
                    {
                        recipient,
                        recipientType,
                    },
                );
            }
            return;
        }

        const blockchain = destinationBlockchain.toLowerCase();
        const pattern = EVM_BLOCKCHAINS.has(blockchain)
            ? EVM_ADDRESS_PATTERN
            : DESTINATION_ADDRESS_PATTERNS[blockchain];

        if (!pattern) {
            throw new SwapValidationError(
                'UNSUPPORTED_RECIPIENT_NETWORK',
                'Destination network does not have a supported recipient validator',
                { destinationBlockchain },
            );
        }

        if (!pattern.test(recipient)) {
            throw new SwapValidationError('INVALID_RECIPIENT', 'Recipient is not valid for the destination network', {
                recipient,
                recipientType,
                destinationBlockchain,
            });
        }
    }
}
