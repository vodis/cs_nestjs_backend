import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MarketComparisonTimeframe } from './get-market-comparison-query.dto';

export class MarketComparisonTokenDto {
    @ApiProperty({ example: 'NEAR' })
    symbol: string;

    @ApiPropertyOptional({ example: 'NEAR Protocol' })
    name?: string;

    @ApiPropertyOptional({ example: 'https://example.com/near.svg' })
    icon?: string;

    @ApiPropertyOptional({ example: 2.79 })
    currentPrice?: number;

    @ApiPropertyOptional({ example: 7.4 })
    changePercent?: number;

    @ApiProperty({ example: true })
    historyAvailable: boolean;
}

export class MarketComparisonPointDto {
    @ApiProperty({ example: 1764979200 })
    time: number;

    @ApiProperty({ example: 100 })
    value: number;
}

export class MarketComparisonSeriesDto {
    @ApiProperty({ example: 'NEAR' })
    symbol: string;

    @ApiProperty({ type: [MarketComparisonPointDto] })
    points: MarketComparisonPointDto[];
}

export class GetMarketComparisonResponseDto {
    @ApiProperty({ example: 'USDC' })
    base: string;

    @ApiProperty({ example: 'NEAR' })
    quote: string;

    @ApiProperty({ example: '1D', enum: ['1H', '1D', '1W'] })
    timeframe: MarketComparisonTimeframe;

    @ApiProperty({ enum: ['ready', 'partial', 'unavailable'] })
    status: 'ready' | 'partial' | 'unavailable';

    @ApiProperty({ type: MarketComparisonTokenDto })
    baseToken: MarketComparisonTokenDto;

    @ApiProperty({ type: MarketComparisonTokenDto })
    quoteToken: MarketComparisonTokenDto;

    @ApiPropertyOptional({ example: -6.2 })
    relativeStrength?: number;

    @ApiProperty({ type: [MarketComparisonSeriesDto] })
    series: MarketComparisonSeriesDto[];
}
