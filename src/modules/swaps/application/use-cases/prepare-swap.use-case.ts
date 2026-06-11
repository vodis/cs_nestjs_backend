import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApprovedPreparePackage } from '../../domain/models/approved-prepare-package';
import { SwapQuoteCommand } from '../../domain/models/swap-quote-request';
import { SwapRequestValidationService } from '../../domain/services/swap-request-validation.service';
import { ASSET_REGISTRY_PORT, AssetRegistryPort } from '../ports/asset-registry.port';
import { QUOTE_PROVIDERS, QuoteProviderPort } from '../ports/quote-provider.port';
import { PreparePackageBuilder } from '../services/prepare-package.builder';
import { SwapQuoteSelectionPolicy } from '../policies/swap-quote-selection.policy';
import { SwapSlippagePolicy } from '../policies/swap-slippage.policy';

@Injectable()
export class PrepareSwapUseCase {
    private readonly validationService = new SwapRequestValidationService();
    private readonly quoteSelectionPolicy = new SwapQuoteSelectionPolicy();
    private readonly slippagePolicy = new SwapSlippagePolicy();
    private readonly preparePackageBuilder = new PreparePackageBuilder();

    constructor(
        @Inject(ASSET_REGISTRY_PORT)
        private readonly assetRegistry: AssetRegistryPort,
        @Inject(QUOTE_PROVIDERS)
        private readonly quoteProviders: QuoteProviderPort[],
        private readonly configService: ConfigService,
    ) {}

    async execute(command: SwapQuoteCommand): Promise<ApprovedPreparePackage> {
        this.validationService.validate(command, { maxSlippageBps: this.getMaxSlippageBps() });

        const [originAsset, destinationAsset] = await Promise.all([
            this.assetRegistry.findById(command.originAsset),
            this.assetRegistry.findById(command.destinationAsset),
        ]);

        this.validationService.assertAssetSupported(command.originAsset, originAsset);
        this.validationService.assertAssetSupported(command.destinationAsset, destinationAsset);

        const quotes = await this.collectQuotes(command);

        if (!quotes.length) {
            throw new ServiceUnavailableException('All quote providers are temporarily unavailable');
        }

        const bestQuote = this.quoteSelectionPolicy.selectBestExecutableQuote(quotes, command.swapType);
        this.slippagePolicy.assertWithinTolerance(
            bestQuote,
            originAsset!,
            destinationAsset!,
            command.slippageTolerance,
        );

        return this.preparePackageBuilder.build(command, bestQuote);
    }

    private async collectQuotes(command: SwapQuoteCommand) {
        const settled = await Promise.allSettled(
            this.quoteProviders.map((provider) => provider.requestQuotes(command)),
        );

        return settled
            .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<QuoteProviderPort['requestQuotes']>>> => {
                return result.status === 'fulfilled';
            })
            .flatMap((result) => result.value);
    }

    private getMaxSlippageBps(): number {
        const configured = Number(this.configService.get('SWAP_MAX_SLIPPAGE_BPS') || 1000);
        return Number.isFinite(configured) && configured > 0 ? configured : 1000;
    }
}
