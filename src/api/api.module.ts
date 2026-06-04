import { Module } from '@nestjs/common';
import { TranslationsModule } from './translations/translations.module';
import { AssetsModule } from './assets/assets.module';

@Module({
    imports: [TranslationsModule, AssetsModule],
})
export class ApiModule {}
