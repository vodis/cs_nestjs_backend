import { Module } from '@nestjs/common';
import { HyperliquidApiModule } from '../../http-clients/hyperliquid-api/hyperliquid-api.module';
import { MarketsController } from './markets.controller';
import { MarketsService } from './markets.service';

@Module({
    imports: [HyperliquidApiModule],
    controllers: [MarketsController],
    providers: [MarketsService],
})
export class MarketsModule {}
