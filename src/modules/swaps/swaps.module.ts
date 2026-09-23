import { Module } from '@nestjs/common';
import { AssetsModule } from '../../api/assets/assets.module';
import { ProductEventsModule } from '../../api/product-events/product-events.module';
import { AuthModule } from '../../api/auth/auth.module';
import { DatabaseModule } from '../../database/database.module';
import { OneClickApiModule } from '../../http-clients/one-click-api/one-click-api.module';
import { SolverRelayApiModule } from '../../http-clients/solver-relay-api/solver-relay-api.module';
import { EXECUTION_PROVIDERS } from './application/ports/execution-provider.port';
import { ASSET_REGISTRY_PORT } from './application/ports/asset-registry.port';
import { QUOTE_PROVIDERS } from './application/ports/quote-provider.port';
import { ExecuteSwapUseCase } from './application/use-cases/execute-swap.use-case';
import { PrepareSwapUseCase } from './application/use-cases/prepare-swap.use-case';
import { AssetRegistryAdapter } from './infrastructure/adapters/asset-registry.adapter';
import { OneClickQuoteProvider } from './infrastructure/providers/one-click-quote.provider';
import { OneClickExecutionProvider } from './infrastructure/providers/one-click-execution.provider';
import { SolverRelayExecutionProvider } from './infrastructure/providers/solver-relay-execution.provider';
import { SolverRelayQuoteProvider } from './infrastructure/providers/solver-relay-quote.provider';
import { SwapsController } from './presentation/swaps.controller';
import { SWAP_EXECUTION_STORE } from './application/ports/swap-execution-store.port';
import { SWAP_WALLET_AUTHORIZATION } from './application/ports/swap-wallet-authorization.port';
import { SwapWalletAuthorizationAdapter } from './infrastructure/adapters/swap-wallet-authorization.adapter';
import { SequelizeSwapExecutionStore } from './infrastructure/repositories/sequelize-swap-execution-store';

@Module({
    imports: [AssetsModule, AuthModule, DatabaseModule, OneClickApiModule, SolverRelayApiModule, ProductEventsModule],
    controllers: [SwapsController],
    providers: [
        PrepareSwapUseCase,
        ExecuteSwapUseCase,
        AssetRegistryAdapter,
        OneClickExecutionProvider,
        SolverRelayExecutionProvider,
        SolverRelayQuoteProvider,
        OneClickQuoteProvider,
        SequelizeSwapExecutionStore,
        SwapWalletAuthorizationAdapter,
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
            useFactory: (solverRelay: SolverRelayExecutionProvider, oneClick: OneClickExecutionProvider) => [
                solverRelay,
                oneClick,
            ],
            inject: [SolverRelayExecutionProvider, OneClickExecutionProvider],
        },
        {
            provide: SWAP_EXECUTION_STORE,
            useExisting: SequelizeSwapExecutionStore,
        },
        {
            provide: SWAP_WALLET_AUTHORIZATION,
            useExisting: SwapWalletAuthorizationAdapter,
        },
    ],
})
export class SwapsModule {}
