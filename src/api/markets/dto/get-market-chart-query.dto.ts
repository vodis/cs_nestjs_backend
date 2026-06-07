import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';

export const CHART_WINDOW_SECS = [3600, 14_400, 86_400, 604_800] as const;

export type ChartWindowSecs = (typeof CHART_WINDOW_SECS)[number];

export class GetMarketChartQueryDto {
    @ApiPropertyOptional({ example: 86_400, enum: CHART_WINDOW_SECS })
    @Type(() => Number)
    @IsInt()
    @IsIn(CHART_WINDOW_SECS)
    @IsOptional()
    windowSecs?: ChartWindowSecs;
}
