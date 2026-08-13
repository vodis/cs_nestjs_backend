import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class PostBalancesRequestDto {
    @ApiPropertyOptional({ description: 'Restrict balances to one active wallet owned by the authenticated user.' })
    @IsOptional()
    @IsUUID()
    walletId?: string;

    @ApiPropertyOptional({ description: 'Restrict balances to one active wallet address owned by the authenticated user.' })
    @IsOptional()
    @IsString()
    @MaxLength(128)
    walletAddress?: string;

    @ApiPropertyOptional({
        description: 'Restrict balances to one CAIP-2 network id.',
        example: 'near:mainnet',
    })
    @IsOptional()
    @IsString()
    @Matches(/^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/, {
        message: 'network must be a CAIP-2 chain id such as near:mainnet or eip155:8453',
    })
    network?: string;

    @ApiPropertyOptional({ description: 'Restrict balances to one backend-supported asset id.' })
    @IsOptional()
    @IsString()
    @MaxLength(256)
    assetId?: string;
}
