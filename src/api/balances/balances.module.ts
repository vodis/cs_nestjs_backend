import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AssetsModule } from '../assets/assets.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../database/database.module';
import { BalancesController } from './balances.controller';
import { BalancesService } from './balances.service';
import { NearRpcBalanceService } from './near-rpc-balance.service';

@Module({
    imports: [AuthModule, AssetsModule, DatabaseModule, ConfigModule, HttpModule],
    controllers: [BalancesController],
    providers: [BalancesService, NearRpcBalanceService],
})
export class BalancesModule {}
