import { Module } from '@nestjs/common';
import { AssetsModule } from '../../api/assets/assets.module';
import { AuthModule } from '../../api/auth/auth.module';
import { DatabaseModule } from '../../database/database.module';
import { GetPortfolioUseCase } from './application/get-portfolio.use-case';
import { ManagePreferencesUseCase } from './application/manage-preferences.use-case';
import { PORTFOLIO_ASSET_SOURCE, PORTFOLIO_REPOSITORY } from './application/portfolio.ports';
import { AssetsPortfolioAdapter } from './infrastructure/assets-portfolio.adapter';
import { SequelizePortfolioRepository } from './infrastructure/sequelize-portfolio.repository';
import { PortfolioController } from './presentation/portfolio.controller';

@Module({
    imports: [AuthModule, AssetsModule, DatabaseModule],
    controllers: [PortfolioController],
    providers: [
        GetPortfolioUseCase,
        ManagePreferencesUseCase,
        { provide: PORTFOLIO_REPOSITORY, useClass: SequelizePortfolioRepository },
        { provide: PORTFOLIO_ASSET_SOURCE, useClass: AssetsPortfolioAdapter },
    ],
    exports: [GetPortfolioUseCase, ManagePreferencesUseCase],
})
export class PortfolioModule {}
