import { Module } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HyperliquidApiModule } from '../../http-clients/hyperliquid-api/hyperliquid-api.module';
import { onHttpModuleInit } from '../../http-clients/http-clients.interceptor';
import { AssetsModule } from '../assets/assets.module';
import { CoinGeckoMarketHistoryClient } from './coingecko-market-history.client';
import { GeckoTerminalMarketHistoryClient } from './geckoterminal-market-history.client';
import { MarketsChartGateway } from './markets-chart.gateway';
import { MarketsController } from './markets.controller';
import { MarketsService } from './markets.service';

@Module({
    imports: [
        AssetsModule,
        HyperliquidApiModule,
        HttpModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                baseURL: configService.get('COINGECKO_API_URL') || 'https://api.coingecko.com/api/v3',
                timeout: Number(configService.get('MARKET_HISTORY_HTTP_TIMEOUT_MS') || 5000),
            }),
            inject: [ConfigService],
        }),
    ],
    controllers: [MarketsController],
    providers: [MarketsService, CoinGeckoMarketHistoryClient, GeckoTerminalMarketHistoryClient, MarketsChartGateway],
})
export class MarketsModule {
    constructor(private readonly httpService: HttpService) {}

    onModuleInit = () => onHttpModuleInit(this.httpService);
}
