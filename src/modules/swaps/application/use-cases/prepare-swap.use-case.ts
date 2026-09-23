import { BadGatewayException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductEventsService } from '../../../../api/product-events/product-events.service';
import { ApprovedPreparePackage } from '../../domain/models/approved-prepare-package';
import { SwapQuoteCommand } from '../../domain/models/swap-quote-request';
import { SwapRequestValidationService } from '../../domain/services/swap-request-validation.service';
import { ASSET_REGISTRY_PORT, AssetRegistryPort } from '../ports/asset-registry.port';
import { QUOTE_PROVIDERS, QuoteProviderPort } from '../ports/quote-provider.port';
import { PreparePackageBuilder } from '../services/prepare-package.builder';
import { SwapQuoteSelectionPolicy } from '../policies/swap-quote-selection.policy';
import { SwapSlippagePolicy } from '../policies/swap-slippage.policy';
import { SWAP_EXECUTION_STORE, SwapExecutionStorePort } from '../ports/swap-execution-store.port';

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
        private readonly productEvents: ProductEventsService,
        @Inject(SWAP_EXECUTION_STORE)
        private readonly executionStore: SwapExecutionStorePort,
    ) {}

    async execute(command: SwapQuoteCommand): Promise<ApprovedPreparePackage> {
        this.validationService.validate(command, { maxSlippageBps: this.getMaxSlippageBps() });

        const [originAsset, destinationAsset] = await Promise.all([
            this.assetRegistry.findById(command.originAsset),
            this.assetRegistry.findById(command.destinationAsset),
        ]);

        this.validationService.assertAssetSupported(command.originAsset, originAsset);
        this.validationService.assertAssetSupported(command.destinationAsset, destinationAsset);
        this.validationService.assertExternalRecipientSupported(command, destinationAsset!);

        await this.productEvents.recordBestEffort({
            eventName: 'swap.quote',
            source: 'backend',
            status: 'attempted',
            metadata: this.swapMetadata(command),
        });

        const quotes = await this.collectQuotes(command);

        if (!quotes.length) {
            await this.productEvents.recordBestEffort({
                eventName: 'swap.quote',
                source: 'backend',
                status: 'failed',
                reasonCode: 'providers_unavailable',
                metadata: this.swapMetadata(command),
            });
            throw new ServiceUnavailableException('All quote providers are temporarily unavailable');
        }

        const allowedModes =
            command.depositType === 'ORIGIN_CHAIN'
                ? (['deposit_address'] as const)
                : command.depositType === 'INTENTS'
                  ? (['intent_sign'] as const)
                  : undefined;
        const bestQuote = this.quoteSelectionPolicy.selectBestExecutableQuote(quotes, command.swapType, allowedModes);
        this.slippagePolicy.assertWithinTolerance(
            bestQuote,
            originAsset!,
            destinationAsset!,
            command.slippageTolerance,
        );

        const packageResult = this.preparePackageBuilder.build(command, bestQuote);
        const expiresAt = new Date(packageResult.quoteExpiration);
        if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
            throw new BadGatewayException({
                code: 'INVALID_SWAP_QUOTE_EXPIRATION',
                message: 'Selected swap quote has an invalid or expired execution deadline',
            });
        }
        if (packageResult.executionPackage.mode === 'intent_sign') {
            const preparation = await this.executionStore.createPreparation({
                providerId: packageResult.providerId,
                executionMode: packageResult.executionPackage.mode,
                userAddress: this.normalizeAddress(packageResult.signerId),
                userChainType: packageResult.authMethod,
                executionPayload: packageResult.executionPackage.payload,
                expiresAt,
            });
            packageResult.executionPackage = {
                ...packageResult.executionPackage,
                payload: {
                    ...packageResult.executionPackage.payload,
                    preparationId: preparation.id,
                },
            };
        }
        await this.productEvents.recordBestEffort({
            eventName: 'swap.quote',
            source: 'backend',
            status: 'succeeded',
            metadata: {
                ...this.swapMetadata(command),
                providerId: bestQuote.providerId,
                executionMode: bestQuote.executionMode,
            },
        });

        return packageResult;
    }

    private async collectQuotes(command: SwapQuoteCommand) {
        const providers = this.validationService.isExternalRecipient(command)
            ? this.quoteProviders.filter((provider) => provider.supportsExternalRecipient)
            : this.quoteProviders;
        const settled = await Promise.allSettled(providers.map((provider) => provider.requestQuotes(command)));

        return settled
            .filter(
                (result): result is PromiseFulfilledResult<Awaited<ReturnType<QuoteProviderPort['requestQuotes']>>> => {
                    return result.status === 'fulfilled';
                },
            )
            .flatMap((result) => result.value);
    }

    private getMaxSlippageBps(): number {
        const configured = Number(this.configService.get('SWAP_MAX_SLIPPAGE_BPS') || 1000);
        return Number.isFinite(configured) && configured > 0 ? configured : 1000;
    }

    private swapMetadata(command: SwapQuoteCommand): Record<string, unknown> {
        return {
            originAsset: command.originAsset,
            destinationAsset: command.destinationAsset,
            swapType: command.swapType,
            authMethod: command.authMethod,
            slippageTolerance: command.slippageTolerance,
        };
    }

    private normalizeAddress(address: string): string {
        return address.trim().toLowerCase();
    }
}
