import { MarketComparisonTimeframe } from './dto/get-market-comparison-query.dto';

export interface MarketHistoryPoint {
    time: number;
    price: number;
}

export interface MarketHistoryProvider {
    getHistory(symbol: string, timeframe: MarketComparisonTimeframe): Promise<MarketHistoryPoint[]>;
}

export const comparisonTimeframeMs: Record<MarketComparisonTimeframe, number> = {
    '1H': 60 * 60_000,
    '1D': 24 * 60 * 60_000,
    '1W': 7 * 24 * 60 * 60_000,
};
