import { ApprovedPreparePackage } from '../../domain/models/approved-prepare-package';
import { SwapQuoteCommand } from '../../domain/models/swap-quote-request';
import { PrepareSwapRequestDto } from '../dto/prepare-swap-request.dto';
import { ApprovedPreparePackageDto } from '../dto/prepare-swap-response.dto';

export class PrepareSwapMapper {
    static toCommand(dto: PrepareSwapRequestDto): SwapQuoteCommand {
        return {
            originAsset: dto.originAsset,
            destinationAsset: dto.destinationAsset,
            amount: dto.amount,
            swapType: dto.swapType,
            slippageTolerance: dto.slippageTolerance,
            deadline: dto.deadline,
            signerId: dto.signerId,
            authMethod: dto.authMethod,
            minDeadlineMs: dto.minDeadlineMs,
        };
    }

    static toResponseDto(packageResult: ApprovedPreparePackage): ApprovedPreparePackageDto {
        return {
            quoteHashes: packageResult.quoteHashes,
            tokenDeltas: packageResult.tokenDeltas,
            intents: packageResult.intents,
            signerId: packageResult.signerId,
            deadline: packageResult.deadline,
            authMethod: packageResult.authMethod,
            signatureStandard: packageResult.signatureStandard,
            originAsset: packageResult.originAsset,
            destinationAsset: packageResult.destinationAsset,
            amountIn: packageResult.amountIn,
            amountOut: packageResult.amountOut,
            slippageTolerance: packageResult.slippageTolerance,
            quoteExpiration: packageResult.quoteExpiration,
            providerId: packageResult.providerId,
        };
    }
}
