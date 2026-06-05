import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsISO8601, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateOneClickQuoteRequestDto {
    @ApiProperty({ example: true })
    @IsBoolean()
    dry: boolean;

    @ApiProperty({ example: 50 })
    @IsNumber()
    @Min(0)
    slippageTolerance: number;

    @ApiProperty({ example: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near' })
    @IsString()
    originAsset: string;

    @ApiProperty({ example: 'nep141:wrap.near' })
    @IsString()
    destinationAsset: string;

    @ApiProperty({ example: '1000000' })
    @IsString()
    amount: string;

    @ApiProperty({ example: '2026-06-05T22:16:58.776Z' })
    @IsISO8601()
    deadline: string;

    @ApiProperty({ example: '0x380B8Fa1eBFe8a652Dbb55c5a7DEc2C683BbD8b9' })
    @IsString()
    userAddress: string;

    @ApiProperty({ example: 'evm' })
    @IsIn(['evm', 'near'])
    authMethod: 'evm' | 'near';

    @ApiProperty({ example: 'EXACT_INPUT' })
    @IsIn(['EXACT_INPUT', 'EXACT_OUTPUT'])
    swapType: 'EXACT_INPUT' | 'EXACT_OUTPUT';

    @ApiProperty({ example: false })
    @IsBoolean()
    @IsOptional()
    isConfidential?: boolean;

    @ApiProperty({ example: true })
    @IsBoolean()
    @IsOptional()
    isAuthenticated?: boolean;
}
