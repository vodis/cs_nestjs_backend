import { Module } from '@nestjs/common';
import { TranslationsModule } from './translations/translations.module';

@Module({
    imports: [TranslationsModule],
})
export class ApiModule {}
