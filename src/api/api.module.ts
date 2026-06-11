import { Module } from '@nestjs/common';
import { TranslationsModule } from './translations/translations.module';
import { AssetsModule } from './assets/assets.module';
import { QuotesModule } from './quotes/quotes.module';
import { MarketsModule } from './markets/markets.module';
import { SwapsModule } from '../modules/swaps';

@Module({
    imports: [TranslationsModule, AssetsModule, QuotesModule, MarketsModule, SwapsModule],
})
export class ApiModule {}
