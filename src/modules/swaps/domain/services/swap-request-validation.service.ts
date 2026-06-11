import { SwapValidationError } from '../errors/swap-validation.error';
import { SwapQuoteCommand } from '../models/swap-quote-request';

export type SwapValidationPolicy = {
    maxSlippageBps: number;
};

export class SwapRequestValidationService {
    validate(command: SwapQuoteCommand, policy: SwapValidationPolicy): void {
        this.assertSignerId(command);
        this.assertDeadline(command.deadline);
        this.assertSlippageTolerance(command.slippageTolerance, policy.maxSlippageBps);

        if (command.originAsset === command.destinationAsset) {
            throw new SwapValidationError('UNSUPPORTED_PAIR', 'Origin and destination assets must differ', {
                originAsset: command.originAsset,
                destinationAsset: command.destinationAsset,
            });
        }
    }

    assertAssetSupported(assetId: string, asset?: { assetId: string }): void {
        if (!asset) {
            throw new SwapValidationError('UNSUPPORTED_ASSET', 'Asset is not in the server allowlist', { assetId });
        }
    }

    private assertSignerId(command: SwapQuoteCommand): void {
        if (command.authMethod === 'evm' && !/^0x[a-fA-F0-9]{40}$/.test(command.signerId)) {
            throw new SwapValidationError('INVALID_SIGNER', 'EVM signerId must be a 0x-prefixed 20-byte address', {
                signerId: command.signerId,
            });
        }

        if (command.authMethod === 'near' && !/^[a-z0-9._-]+\.(?:near|testnet|tg)$/i.test(command.signerId)) {
            throw new SwapValidationError('INVALID_SIGNER', 'NEAR signerId must be a valid NEAR account id', {
                signerId: command.signerId,
            });
        }
    }

    private assertDeadline(deadline: string): void {
        const deadlineMs = Date.parse(deadline);

        if (!Number.isFinite(deadlineMs) || deadlineMs <= Date.now()) {
            throw new SwapValidationError('INVALID_DEADLINE', 'Deadline must be a future ISO-8601 timestamp', {
                deadline,
            });
        }
    }

    private assertSlippageTolerance(slippageTolerance: number, maxSlippageBps: number): void {
        if (slippageTolerance > maxSlippageBps) {
            throw new SwapValidationError(
                'SLIPPAGE_OUT_OF_RANGE',
                `Slippage tolerance must be <= ${maxSlippageBps} basis points`,
                { slippageTolerance, maxSlippageBps },
            );
        }
    }
}
