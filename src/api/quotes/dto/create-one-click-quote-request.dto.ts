import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsISO8601, IsNumber, IsOptional, IsString, Min } from 'class-validator';

const deadlineExample = new Date(Date.now() + 15 * 60 * 1000).toISOString();

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

    @ApiProperty({ example: deadlineExample })
    @IsISO8601()
    deadline: string;

    @ApiProperty({ example: '0x380b8fa1ebfe8a652dbb55c5a7dec2c683bbd8b9' })
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
