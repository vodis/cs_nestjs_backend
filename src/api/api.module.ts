import { Module } from '@nestjs/common';
import { TranslationsModule } from './translations/translations.module';
import { AssetsModule } from './assets/assets.module';
import { QuotesModule } from './quotes/quotes.module';
import { MarketsModule } from './markets/markets.module';
import { SwapsModule } from '../modules/swaps';
import { AuthModule } from './auth/auth.module';
import { BalancesModule } from './balances/balances.module';
import { PortfolioModule } from '../modules/portfolio';
import { AgentAccessModule } from '../modules/agent-access';

@Module({
    imports: [
        AuthModule,
        TranslationsModule,
        AssetsModule,
        QuotesModule,
        MarketsModule,
        SwapsModule,
        BalancesModule,
        PortfolioModule,
        AgentAccessModule,
    ],
})
export class ApiModule {}
