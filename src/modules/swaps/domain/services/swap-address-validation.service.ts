import { createHash } from 'crypto';
import { decodeBase58, toBeArray } from 'ethers';
import { PublicKey } from '@solana/web3.js';
import { Address as BitcoinAddress } from 'bip322-js';
import { Address } from '@ton/core';
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
    'abs',
    'adi',
    'hood',
    'hlevm',
    'hypercore',
]);

const DESTINATION_ADDRESS_PATTERNS: Record<string, RegExp> = {
    near: new RegExp(`(?:${NEAR_ACCOUNT_PATTERN.source}|${NEAR_IMPLICIT_ACCOUNT_PATTERN.source})`, 'i'),
    sol: new RegExp(`^${BASE58_PATTERN}{32,44}$`),
    fogo: new RegExp(`^${BASE58_PATTERN}{32,44}$`),
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
    movement: /^0x[a-fA-F0-9]{64}$/,
    sui: /^0x[a-fA-F0-9]{64}$/,
    starknet: /^0x[a-fA-F0-9]{1,64}$/,
};

export class SwapAddressValidationService {
    assertDestinationMemo(blockchain: string, recipientType: string, memo?: string, recipient?: string): void {
        if (memo === undefined) return;
        // 1Click destinationMemo is an XRP uint32 tag. It is never depositMemo.
        if (
            recipientType !== 'DESTINATION_CHAIN' ||
            blockchain !== 'xrp' ||
            recipient?.startsWith('X') ||
            !/^(0|[1-9][0-9]{0,9})$/.test(memo) ||
            BigInt(memo) > 4294967295n
        ) {
            throw new SwapValidationError('INVALID_RECIPIENT', 'Invalid or unsupported destination memo/tag');
        }
    }

    areEquivalent(authMethod: string, left: string, right: string): boolean {
        return authMethod === 'evm' || authMethod === 'near'
            ? left.toLowerCase() === right.toLowerCase()
            : left === right;
    }

    assertSupportedAuthMethod(authMethod: string): asserts authMethod is SwapAuthMethod {
        if (
            authMethod !== 'evm' &&
            authMethod !== 'near' &&
            authMethod !== 'ton' &&
            authMethod !== 'solana' &&
            authMethod !== 'bitcoin'
        ) {
            throw new SwapValidationError(
                'UNSUPPORTED_AUTH_METHOD',
                'Only EVM, NEAR, TON, Solana and Bitcoin wallets are supported for 1Click quotes',
                { authMethod },
            );
        }
    }

    assertSignerAddress(authMethod: string, signerId: string): asserts authMethod is SwapAuthMethod {
        this.assertSupportedAuthMethod(authMethod);

        if (authMethod === 'solana') {
            try {
                const key = new PublicKey(signerId);
                if (key.toBase58() !== signerId || !PublicKey.isOnCurve(key.toBytes())) throw new Error();
            } catch {
                throw new SwapValidationError('INVALID_SIGNER', 'Invalid Solana signer');
            }
        }
        if (
            authMethod === 'bitcoin' &&
            (!/^(?:[13]|bc1)/.test(signerId) || !BitcoinAddress.isValidBitcoinAddress(signerId))
        )
            throw new SwapValidationError('INVALID_SIGNER', 'Invalid Bitcoin mainnet signer');
        if (authMethod === 'ton') {
            try {
                Address.parse(signerId);
            } catch {
                throw new SwapValidationError('INVALID_SIGNER', 'Invalid TON wallet address');
            }
        }
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
        recipientType: 'DESTINATION_CHAIN' | 'INTENTS' | 'CONFIDENTIAL_INTENTS',
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

        if (recipientType === 'INTENTS' || recipientType === 'CONFIDENTIAL_INTENTS') {
            if (
                !NEAR_ACCOUNT_PATTERN.test(recipient) &&
                !NEAR_IMPLICIT_ACCOUNT_PATTERN.test(recipient) &&
                !EVM_ADDRESS_PATTERN.test(recipient)
            ) {
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
        if (blockchain === 'sol' || blockchain === 'fogo') {
            try {
                if (new PublicKey(recipient).toBase58() === recipient) return;
            } catch {
                /* Reject invalid public keys below. */
            }
            throw new SwapValidationError('INVALID_RECIPIENT', 'Invalid Solana-family recipient');
        }
        if (
            blockchain === 'btc' &&
            (!/^(?:[13]|bc1)/.test(recipient) || !BitcoinAddress.isValidBitcoinAddress(recipient))
        )
            throw new SwapValidationError('INVALID_RECIPIENT', 'Invalid Bitcoin mainnet recipient');
        if (blockchain === 'qtc') {
            try {
                const bytes = Buffer.from(toBeArray(decodeBase58(recipient)));
                // Quantus AccountId32 uses SS58 prefix 189 and a two-byte Blake2b checksum.
                const checksum = createHash('blake2b512')
                    .update(Buffer.concat([Buffer.from('SS58PRE'), bytes.subarray(0, -2)]))
                    .digest();
                if (
                    bytes.length === 36 &&
                    bytes[0] === 0x6f &&
                    bytes[1] === 0x40 &&
                    bytes.subarray(-2).equals(checksum.subarray(0, 2))
                )
                    return;
            } catch {
                /* Reject invalid SS58 below. */
            }
            throw new SwapValidationError('INVALID_RECIPIENT', 'Invalid Quantus recipient');
        }
        if (blockchain === 'ton') {
            try {
                Address.parse(recipient);
                return;
            } catch {
                throw new SwapValidationError('INVALID_RECIPIENT', 'Invalid TON recipient');
            }
        }
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
