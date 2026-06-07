import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetMarketCandlesQueryDto {
    @ApiPropertyOptional({ example: '1h', enum: ['1m', '5m', '15m', '1h', '4h', '1d'] })
    @IsIn(['1m', '5m', '15m', '1h', '4h', '1d'])
    @IsOptional()
    interval?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

    @ApiPropertyOptional({ example: 120, minimum: 24, maximum: 500 })
    @Type(() => Number)
    @IsInt()
    @Min(24)
    @Max(500)
    @IsOptional()
    limit?: number;
}
