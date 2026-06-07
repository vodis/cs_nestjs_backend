import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssetDto {
    @ApiProperty()
    assetId: string;

    @ApiProperty()
    defuseAssetId: string;

    @ApiProperty()
    symbol: string;

    @ApiPropertyOptional()
    name?: string;

    @ApiPropertyOptional()
    icon?: string;

    @ApiProperty()
    decimals: number;

    @ApiProperty()
    blockchain: string;

    @ApiPropertyOptional()
    contractAddress?: string;

    @ApiPropertyOptional()
    price?: string | number;

    @ApiPropertyOptional()
    priceUpdatedAt?: string;
}

export class AssetsMetaDto {
    @ApiProperty({ enum: ['1click'] })
    source: '1click';

    @ApiProperty()
    cached: boolean;

    @ApiProperty()
    fetchedAt: string;
}

export class GetAssetsResponseDto {
    @ApiProperty({ type: [AssetDto] })
    data: AssetDto[];

    @ApiProperty({ type: AssetsMetaDto })
    meta: AssetsMetaDto;
}
