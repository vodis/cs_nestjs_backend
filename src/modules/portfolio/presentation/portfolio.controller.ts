import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../api/auth/current-user.decorator';
import { PrivyAuthGuard } from '../../../api/auth/privy-auth.guard';
import { AuthenticatedUser } from '../../../api/auth/types';
import { GetPortfolioUseCase } from '../application/get-portfolio.use-case';
import { ManagePreferencesUseCase } from '../application/manage-preferences.use-case';
import { PutInvestmentProfileDto } from './investment-profile.dto';

@ApiTags('portfolio')
@ApiBearerAuth()
@Controller({ version: '1' })
@UseGuards(PrivyAuthGuard)
export class PortfolioController {
    constructor(
        private readonly getPortfolio: GetPortfolioUseCase,
        private readonly preferences: ManagePreferencesUseCase,
    ) {}

    @Get('portfolio') portfolio(@CurrentUser() user: AuthenticatedUser) {
        return this.getPortfolio.execute(user.id);
    }

    @Get('investment-profile') getPreferences(@CurrentUser() user: AuthenticatedUser) {
        return this.preferences.get(user.id);
    }

    @Put('investment-profile') putPreferences(
        @CurrentUser() user: AuthenticatedUser,
        @Body() body: PutInvestmentProfileDto,
    ) {
        return this.preferences.save(user.id, body);
    }
}
