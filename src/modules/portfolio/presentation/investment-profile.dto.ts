import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { InvestmentPreferences } from '../application/portfolio.types';

export class PutInvestmentProfileDto implements InvestmentPreferences {
    @ApiProperty({ enum: ['growth', 'income', 'capital_preservation'] })
    @IsIn(['growth', 'income', 'capital_preservation'])
    objective: InvestmentPreferences['objective'];

    @ApiProperty({ enum: ['conservative', 'balanced', 'aggressive'] })
    @IsIn(['conservative', 'balanced', 'aggressive'])
    riskTolerance: InvestmentPreferences['riskTolerance'];

    @ApiProperty({ enum: ['under_1y', '1_3y', '3_5y', 'over_5y'] })
    @IsIn(['under_1y', '1_3y', '3_5y', 'over_5y'])
    horizon: InvestmentPreferences['horizon'];
}
