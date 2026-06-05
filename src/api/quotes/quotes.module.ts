import { Module } from '@nestjs/common';
import { OneClickApiModule } from '../../http-clients/one-click-api/one-click-api.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
    imports: [OneClickApiModule],
    controllers: [QuotesController],
    providers: [QuotesService],
})
export class QuotesModule {}
