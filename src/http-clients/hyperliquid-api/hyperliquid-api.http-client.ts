import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { HyperliquidCandleDto } from './dto/hyperliquid-candle.dto';
import {
    HyperliquidAssetContextDto,
    HyperliquidMetaDto,
} from './dto/hyperliquid-asset-context.dto';

export type HyperliquidCandleInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

@Injectable()
export class HyperliquidApiHttpClient {
    constructor(private readonly httpServer: HttpService) {}

    async getCandles(
        coin: string,
        interval: HyperliquidCandleInterval,
        startTime: number,
        endTime: number,
    ): Promise<HyperliquidCandleDto[]> {
        const { data } = await this.httpServer.axiosRef.post<HyperliquidCandleDto[]>('/info', {
            type: 'candleSnapshot',
            req: {
                coin,
                interval,
                startTime,
                endTime,
            },
        });

        return data;
    }

    async getMetaAndAssetCtxs(): Promise<[HyperliquidMetaDto, HyperliquidAssetContextDto[]]> {
        const { data } = await this.httpServer.axiosRef.post<[HyperliquidMetaDto, HyperliquidAssetContextDto[]]>(
            '/info',
            {
                type: 'metaAndAssetCtxs',
            },
        );

        return data;
    }
}
