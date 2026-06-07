import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MarketCandleDto } from './get-market-candles-response.dto';

export class GetMarketChartResponseDto {
    @ApiProperty({ example: 'NEAR' })
    symbol: string;

    @ApiProperty({ example: '15m' })
    interval: string;

    @ApiProperty({ example: 86_400 })
    windowSecs: number;

    @ApiProperty({ type: [MarketCandleDto] })
    candles: MarketCandleDto[];

    @ApiPropertyOptional({ example: 1.86 })
    prevDayPx?: number;

    @ApiPropertyOptional({ example: 1.98 })
    currentPrice?: number;

    @ApiPropertyOptional({ example: 6.25 })
    change24hPercent?: number;
}
