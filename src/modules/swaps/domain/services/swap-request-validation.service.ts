import { SwapValidationError } from '../errors/swap-validation.error';
import { SwapQuoteCommand } from '../models/swap-quote-request';
import { SwapAddressValidationService } from './swap-address-validation.service';

export type SwapValidationPolicy = {
    maxSlippageBps: number;
};

export class SwapRequestValidationService {
    private readonly addressValidationService: SwapAddressValidationService = new SwapAddressValidationService();

    validate(command: SwapQuoteCommand, policy: SwapValidationPolicy): void {
        this.addressValidationService.assertSignerAddress(command.authMethod, command.signerId);
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
