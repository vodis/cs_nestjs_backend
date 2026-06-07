import { CHART_WINDOW_SECS, ChartWindowSecs } from './dto/get-market-chart-query.dto';
import { HyperliquidCandleInterval } from '../../http-clients/hyperliquid-api/hyperliquid-api.http-client';

export interface ChartWindowConfig {
    windowSecs: ChartWindowSecs;
    interval: HyperliquidCandleInterval;
    lookbackMs: number;
}

export const CHART_WINDOW_CONFIG: Record<ChartWindowSecs, ChartWindowConfig> = {
    3600: { windowSecs: 3600, interval: '1m', lookbackMs: 3_600_000 },
    14_400: { windowSecs: 14_400, interval: '5m', lookbackMs: 14_400_000 },
    86_400: { windowSecs: 86_400, interval: '15m', lookbackMs: 86_400_000 },
    604_800: { windowSecs: 604_800, interval: '1h', lookbackMs: 604_800_000 },
};

export function resolveChartWindow(windowSecs?: number): ChartWindowConfig {
    if (windowSecs && CHART_WINDOW_SECS.includes(windowSecs as ChartWindowSecs)) {
        return CHART_WINDOW_CONFIG[windowSecs as ChartWindowSecs];
    }

    return CHART_WINDOW_CONFIG[3600];
}

export interface MarketAssetContext {
    prevDayPx?: number;
    markPx?: number;
}
