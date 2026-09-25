import { ApiProperty } from '@nestjs/swagger';

export class MarketSnapshotDto {
    @ApiProperty({ example: 'NEAR' })
    symbol: string;

    @ApiProperty({ example: 5.1 })
    priceUsd: number;

    @ApiProperty({ example: 3.42 })
    change24hPercent: number;

    @ApiProperty({ example: 6_100_000_000 })
    marketCapUsd: number;

    @ApiProperty({ example: 312_000_000 })
    volume24hUsd: number;

    @ApiProperty({ type: [Number], example: [4.8, 5.1] })
    sparkline7d: number[];
}

export class MarketSnapshotsMetaDto {
    @ApiProperty({ enum: ['coingecko', 'unavailable'] })
    source: 'coingecko' | 'unavailable';

    @ApiProperty()
    cached: boolean;

    @ApiProperty()
    fetchedAt: string;
}

export class GetMarketSnapshotsResponseDto {
    @ApiProperty({ type: [MarketSnapshotDto] })
    data: MarketSnapshotDto[];

    @ApiProperty({ type: MarketSnapshotsMetaDto })
    meta: MarketSnapshotsMetaDto;
}
