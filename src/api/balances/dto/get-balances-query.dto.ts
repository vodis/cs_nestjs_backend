import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class GetBalancesQueryDto {
    @ApiPropertyOptional({ description: 'Restrict balances to one active wallet owned by the authenticated user.' })
    @IsOptional()
    @IsUUID()
    walletId?: string;

    @ApiPropertyOptional({ description: 'Restrict balances to one backend-supported asset id.' })
    @IsOptional()
    @IsString()
    @MaxLength(256)
    assetId?: string;
}
