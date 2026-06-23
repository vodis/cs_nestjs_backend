import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../database/database.module';
import { BalancesController } from './balances.controller';
import { BalancesService } from './balances.service';

@Module({
    imports: [AuthModule, AssetsModule, DatabaseModule],
    controllers: [BalancesController],
    providers: [BalancesService],
})
export class BalancesModule {}
