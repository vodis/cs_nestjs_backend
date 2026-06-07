import { Module } from '@nestjs/common';
import { OneClickApiModule } from '../../http-clients/one-click-api/one-click-api.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
    imports: [OneClickApiModule],
    controllers: [AssetsController],
    providers: [AssetsService],
    exports: [AssetsService],
})
export class AssetsModule {}
