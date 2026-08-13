import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AssetsModule } from '../assets/assets.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../database/database.module';
import { NearRpcApiModule } from '../../http-clients/near-rpc-api/near-rpc-api.module';
import { BalancesController } from './balances.controller';
import { BalancesService } from './balances.service';
import { NearRpcBalanceService } from './near-rpc-balance.service';

@Module({
    imports: [AuthModule, AssetsModule, DatabaseModule, ConfigModule, NearRpcApiModule],
    controllers: [BalancesController],
    providers: [BalancesService, NearRpcBalanceService],
})
export class BalancesModule {}
