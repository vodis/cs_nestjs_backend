import { Module } from '@nestjs/common';
import { OneClickApiModule } from '../../http-clients/one-click-api/one-click-api.module';
import { AssetsModule } from '../assets/assets.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
    imports: [OneClickApiModule, AssetsModule],
    controllers: [QuotesController],
    providers: [QuotesService],
})
export class QuotesModule {}
