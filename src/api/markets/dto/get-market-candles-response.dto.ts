import { ApiProperty } from '@nestjs/swagger';

export class MarketCandleDto {
    @ApiProperty({ example: 1764979200 })
    time: number;

    @ApiProperty({ example: 1.91 })
    open: number;

    @ApiProperty({ example: 1.98 })
    high: number;

    @ApiProperty({ example: 1.88 })
    low: number;

    @ApiProperty({ example: 1.95 })
    close: number;

    @ApiProperty({ example: 125420.5 })
    volume: number;
}

export class GetMarketCandlesResponseDto {
    @ApiProperty({ example: 'NEAR' })
    symbol: string;

    @ApiProperty({ example: '1h' })
    interval: string;

    @ApiProperty({ type: [MarketCandleDto] })
    candles: MarketCandleDto[];
}
