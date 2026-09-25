import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GetMarketSnapshotsQueryDto {
    @ApiProperty({ example: 'NEAR,BTC,USDT' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(800)
    symbols: string;
}
