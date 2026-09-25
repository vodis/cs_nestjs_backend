import { Controller, Get, Param, Query, Sse } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { GetMarketCandlesQueryDto } from './dto/get-market-candles-query.dto';
import { GetMarketCandlesResponseDto } from './dto/get-market-candles-response.dto';
import { GetMarketComparisonQueryDto } from './dto/get-market-comparison-query.dto';
import { GetMarketComparisonResponseDto } from './dto/get-market-comparison-response.dto';
import { GetMarketChartQueryDto } from './dto/get-market-chart-query.dto';
import { GetMarketChartResponseDto } from './dto/get-market-chart-response.dto';
import { GetMarketSnapshotsQueryDto } from './dto/get-market-snapshots-query.dto';
import { GetMarketSnapshotsResponseDto } from './dto/get-market-snapshots-response.dto';
import { MarketSnapshotService } from './market-snapshot.service';
import { MarketsService } from './markets.service';

@Controller({ version: '1', path: 'markets' })
export class MarketsController {
    constructor(
        private readonly marketsService: MarketsService,
        private readonly marketSnapshotService: MarketSnapshotService,
    ) {}

    @Get('snapshots')
    @ApiResponse({
        status: 200,
        description: 'Get cached CoinGecko price, market cap, volume, and 7d sparkline snapshots',
        type: GetMarketSnapshotsResponseDto,
    })
    getSnapshots(@Query() query: GetMarketSnapshotsQueryDto): Promise<GetMarketSnapshotsResponseDto> {
        return this.marketSnapshotService.getSnapshots(query.symbols);
    }

    @Get('comparison')
    @ApiResponse({
        status: 200,
        description: 'Get normalized comparative market performance for a swap pair',
        type: GetMarketComparisonResponseDto,
    })
    async getComparison(@Query() query: GetMarketComparisonQueryDto): Promise<GetMarketComparisonResponseDto> {
        return this.marketsService.getComparison(query.base, query.quote, query.timeframe);
    }

    @Get(':symbol/candles')
    @ApiResponse({
        status: 200,
        description: 'Get normalized OHLCV candles for chart rendering',
        type: GetMarketCandlesResponseDto,
    })
    async getCandles(
        @Param('symbol') symbol: string,
        @Query() query: GetMarketCandlesQueryDto,
    ): Promise<GetMarketCandlesResponseDto> {
        return this.marketsService.getCandles(symbol, query.interval || '1h', query.limit || 120);
    }

    @Get(':symbol/chart')
    @ApiResponse({
        status: 200,
        description: 'Get chart bootstrap payload with candles and 24h market context',
        type: GetMarketChartResponseDto,
    })
    async getChart(
        @Param('symbol') symbol: string,
        @Query() query: GetMarketChartQueryDto,
    ): Promise<GetMarketChartResponseDto> {
        return this.marketsService.getChart(symbol, query.windowSecs);
    }

    @Sse(':symbol/candles/stream')
    streamCandles(
        @Param('symbol') symbol: string,
        @Query() query: GetMarketCandlesQueryDto,
    ): Observable<{ data: GetMarketCandlesResponseDto }> {
        return this.marketsService.streamCandles(symbol, query.interval || '1m');
    }
}
