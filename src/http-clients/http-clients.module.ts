import { Module } from '@nestjs/common';
import { I18nServiceApiModule } from './i18n-api/i18n-service-api.module';
import { OneClickApiModule } from './one-click-api/one-click-api.module';
import { HyperliquidApiModule } from './hyperliquid-api/hyperliquid-api.module';
import { SolverRelayApiModule } from './solver-relay-api/solver-relay-api.module';

@Module({
    imports: [I18nServiceApiModule, OneClickApiModule, HyperliquidApiModule, SolverRelayApiModule],
    exports: [I18nServiceApiModule, OneClickApiModule, HyperliquidApiModule, SolverRelayApiModule],
})
export class HttpClientsModule {}
