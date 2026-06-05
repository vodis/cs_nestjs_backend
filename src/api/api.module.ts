import { Module } from '@nestjs/common';
import { TranslationsModule } from './translations/translations.module';
import { AssetsModule } from './assets/assets.module';
import { QuotesModule } from './quotes/quotes.module';

@Module({
    imports: [TranslationsModule, AssetsModule, QuotesModule],
})
export class ApiModule {}
