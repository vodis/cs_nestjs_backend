import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

const deadlineExample = new Date(Date.now() + 15 * 60 * 1000).toISOString();

export class PrepareSwapRequestDto {
    @ApiProperty({ example: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near' })
    @IsString()
    originAsset: string;

    @ApiProperty({ example: 'nep141:wrap.near' })
    @IsString()
    destinationAsset: string;

    @ApiProperty({ example: '1000000', description: 'Amount in smallest token units' })
    @IsString()
    @Matches(/^[1-9]\d*$/, { message: 'amount must be a positive integer string' })
    amount: string;

    @ApiProperty({ example: 'EXACT_INPUT' })
    @IsIn(['EXACT_INPUT', 'EXACT_OUTPUT'])
    swapType: 'EXACT_INPUT' | 'EXACT_OUTPUT';

    @ApiProperty({ example: 100, description: 'Slippage tolerance in basis points (100 = 1%)' })
    @IsNumber()
    @Min(0)
    slippageTolerance: number;

    @ApiProperty({ example: deadlineExample })
    @IsISO8601()
    deadline: string;

    @ApiProperty({ example: '0x380b8fa1ebfe8a652dbb55c5a7dec2c683bbd8b9' })
    @IsString()
    signerId: string;

    @ApiProperty({ example: 'evm' })
    @IsIn(['evm', 'near'])
    authMethod: 'evm' | 'near';

    @ApiPropertyOptional({ example: 60000, description: 'Minimum quote validity in milliseconds' })
    @IsOptional()
    @IsNumber()
    @Min(1000)
    minDeadlineMs?: number;
}
