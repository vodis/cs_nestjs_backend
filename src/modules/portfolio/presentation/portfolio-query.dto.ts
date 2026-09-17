import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class GetPortfolioQueryDto {
    @ApiPropertyOptional({
        description: 'Value one wallet address. Unlinked addresses require network and are read-only.',
    })
    @IsOptional()
    @IsString()
    @MaxLength(128)
    walletAddress?: string;

    @ApiPropertyOptional({ description: 'Restrict valuation to one CAIP-2 network id.', example: 'near:mainnet' })
    @IsOptional()
    @IsString()
    @Matches(/^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/, {
        message: 'network must be a CAIP-2 chain id such as near:mainnet or eip155:8453',
    })
    network?: string;
}
