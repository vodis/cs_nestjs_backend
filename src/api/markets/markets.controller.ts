import { Controller, Get, Param, Query, Sse } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { GetMarketCandlesQueryDto } from './dto/get-market-candles-query.dto';
import { GetMarketCandlesResponseDto } from './dto/get-market-candles-response.dto';
import { MarketsService } from './markets.service';

@Controller({ version: '1', path: 'markets' })
export class MarketsController {
    constructor(private readonly marketsService: MarketsService) {}

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

    @Sse(':symbol/candles/stream')
    streamCandles(
        @Param('symbol') symbol: string,
        @Query() query: GetMarketCandlesQueryDto,
    ): Observable<{ data: GetMarketCandlesResponseDto }> {
        return this.marketsService.streamCandles(symbol, query.interval || '1m');
    }
}
