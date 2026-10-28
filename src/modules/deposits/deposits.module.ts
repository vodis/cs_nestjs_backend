import { Module } from '@nestjs/common';
import { AuthModule } from '../../api/auth/auth.module';
import { AssetsModule } from '../../api/assets/assets.module';
import { OneClickApiModule } from '../../http-clients/one-click-api/one-click-api.module';
import { CreateDepositUseCase } from './application/create-deposit.use-case';
import { DepositProvider, DepositWalletSource } from './application/deposit.ports';
import { DepositWalletAdapter } from './infrastructure/deposit-wallet.adapter';
import { OneClickDepositAdapter } from './infrastructure/one-click-deposit.adapter';
import { DepositsController } from './presentation/deposits.controller';

@Module({
    imports: [AuthModule, AssetsModule, OneClickApiModule],
    controllers: [DepositsController],
    providers: [
        CreateDepositUseCase,
        { provide: DepositWalletSource, useClass: DepositWalletAdapter },
        { provide: DepositProvider, useClass: OneClickDepositAdapter },
    ],
})
export class DepositsModule {}
