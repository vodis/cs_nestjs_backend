import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BalanceDto {
    @ApiProperty()
    walletId: string;

    @ApiProperty()
    walletAddress: string;

    @ApiProperty()
    chainType: string;

    @ApiProperty()
    assetId: string;

    @ApiProperty()
    symbol: string;

    @ApiProperty()
    decimals: number;

    @ApiProperty()
    balanceRaw: string;

    @ApiPropertyOptional()
    balanceDecimal?: string | null;

    @ApiProperty()
    source: string;

    @ApiProperty()
    fetchedAt: string;

    @ApiProperty()
    expiresAt: string;
}

export class BalancesMetaDto {
    @ApiProperty({ enum: ['postgres_cache'] })
    source: 'postgres_cache';

    @ApiProperty()
    cached: boolean;

    @ApiProperty()
    fetchedAt: string;
}

export class GetBalancesResponseDto {
    @ApiProperty({ type: [BalanceDto] })
    data: BalanceDto[];

    @ApiProperty({ type: BalancesMetaDto })
    meta: BalancesMetaDto;
}
