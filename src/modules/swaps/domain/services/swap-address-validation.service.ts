import { SwapValidationError } from '../errors/swap-validation.error';
import { SwapAuthMethod } from '../models/swap-quote-request';

const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const NEAR_ACCOUNT_PATTERN = /^[a-z0-9._-]+\.(?:near|testnet|tg)$/i;

export class SwapAddressValidationService {
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
}
