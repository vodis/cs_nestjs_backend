import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export type MarketComparisonTimeframe = '1H' | '1D' | '1W';

export class GetMarketComparisonQueryDto {
    @ApiProperty({ example: 'USDC' })
    @IsString()
    @MinLength(1)
    @MaxLength(24)
    base: string;

    @ApiProperty({ example: 'NEAR' })
    @IsString()
    @MinLength(1)
    @MaxLength(24)
    quote: string;

    @ApiProperty({ example: '1D', enum: ['1H', '1D', '1W'] })
    @IsIn(['1H', '1D', '1W'])
    timeframe: MarketComparisonTimeframe;
}
