import { Module } from '@nestjs/common';
import { AssetsModule } from '../../api/assets/assets.module';
import { ProductEventsModule } from '../../api/product-events/product-events.module';
import { OneClickApiModule } from '../../http-clients/one-click-api/one-click-api.module';
import { SolverRelayApiModule } from '../../http-clients/solver-relay-api/solver-relay-api.module';
import { EXECUTION_PROVIDERS } from './application/ports/execution-provider.port';
import { ASSET_REGISTRY_PORT } from './application/ports/asset-registry.port';
import { QUOTE_PROVIDERS } from './application/ports/quote-provider.port';
import { ExecuteSwapUseCase } from './application/use-cases/execute-swap.use-case';
import { PrepareSwapUseCase } from './application/use-cases/prepare-swap.use-case';
import { AssetRegistryAdapter } from './infrastructure/adapters/asset-registry.adapter';
import { OneClickQuoteProvider } from './infrastructure/providers/one-click-quote.provider';
import { SolverRelayExecutionProvider } from './infrastructure/providers/solver-relay-execution.provider';
import { SolverRelayQuoteProvider } from './infrastructure/providers/solver-relay-quote.provider';
import { SwapsController } from './presentation/swaps.controller';

@Module({
    imports: [AssetsModule, OneClickApiModule, SolverRelayApiModule, ProductEventsModule],
    controllers: [SwapsController],
    providers: [
        PrepareSwapUseCase,
        ExecuteSwapUseCase,
        AssetRegistryAdapter,
        SolverRelayExecutionProvider,
        SolverRelayQuoteProvider,
        OneClickQuoteProvider,
        {
            provide: ASSET_REGISTRY_PORT,
            useExisting: AssetRegistryAdapter,
        },
        {
            provide: QUOTE_PROVIDERS,
            useFactory: (solverRelay: SolverRelayQuoteProvider, oneClick: OneClickQuoteProvider) => [
                solverRelay,
                oneClick,
            ],
            inject: [SolverRelayQuoteProvider, OneClickQuoteProvider],
        },
        {
            provide: EXECUTION_PROVIDERS,
            useFactory: (solverRelay: SolverRelayExecutionProvider) => [solverRelay],
            inject: [SolverRelayExecutionProvider],
        },
    ],
})
export class SwapsModule {}
