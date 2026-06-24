import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AssetDto } from '../assets/dto/get-assets-response.dto';
import { MarketComparisonTimeframe } from './dto/get-market-comparison-query.dto';
import { MarketHistoryPoint } from './market-history.types';

interface GeckoTerminalPool {
    id: string;
    attributes?: {
        address?: string;
        reserve_in_usd?: string;
        volume_usd?: {
            h24?: string;
        };
    };
}

interface GeckoTerminalPoolsResponse {
    data?: GeckoTerminalPool[];
}

interface GeckoTerminalOhlcvResponse {
    data?: {
        attributes?: {
            ohlcv_list?: [number, number, number, number, number, number][];
        };
    };
}

interface CacheEntry<T> {
    expiresAt: number;
    value: T;
}

interface OhlcvRequestConfig {
    timeframe: 'minute' | 'hour' | 'day';
    aggregate: number;
    limit: number;
}

const defaultBaseUrl = 'https://api.geckoterminal.com/api/v2';
const defaultVersion = '20230302';
const defaultHistoryTtlMs = 5 * 60_000;
const defaultResolutionTtlMs = 24 * 60 * 60_000;

const networkByBlockchain: Record<string, string> = {
    arb: 'arbitrum',
    arbitrum: 'arbitrum',
    aurora: 'aurora',
    avax: 'avax',
    avalanche: 'avax',
    base: 'base',
    bnb: 'bsc',
    bsc: 'bsc',
    eth: 'eth',
    ethereum: 'eth',
    gnosis: 'xdai',
    op: 'optimism',
    optimism: 'optimism',
    pol: 'polygon_pos',
    polygon: 'polygon_pos',
    scroll: 'scroll',
    sol: 'solana',
    solana: 'solana',
    starknet: 'starknet-alpha',
};

@Injectable()
export class GeckoTerminalMarketHistoryClient {
    private readonly poolCache = new Map<string, CacheEntry<string | undefined>>();
    private readonly historyCache = new Map<string, CacheEntry<MarketHistoryPoint[]>>();
    private readonly requestTimestamps: number[] = [];

    constructor(
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
    ) {}

    async getHistory(asset: AssetDto | undefined, timeframe: MarketComparisonTimeframe): Promise<MarketHistoryPoint[]> {
        if (!asset || !this.isEnabled()) {
            return [];
        }

        const network = resolveNetwork(asset.blockchain);
        const tokenAddress = normalizeTokenAddress(asset.contractAddress);
        if (!network || !tokenAddress) {
            return [];
        }

        const poolAddress = await this.resolvePoolAddress(network, tokenAddress);
        if (!poolAddress) {
            return [];
        }

        return this.getPoolHistory(network, poolAddress, timeframe);
    }

    private isEnabled(): boolean {
        return this.configService.get<string>('MARKET_HISTORY_ENABLE_GECKOTERMINAL') === 'true';
    }

    private async resolvePoolAddress(network: string, tokenAddress: string): Promise<string | undefined> {
        const key = `${network}:${tokenAddress}`;
        const cached = getCached(this.poolCache, key);
        if (cached.hit) {
            return cached.value;
        }

        try {
            if (!this.reserveRequestSlot()) {
                return undefined;
            }

            const { data } = await this.httpService.axiosRef.get<GeckoTerminalPoolsResponse>(
                this.url(`/networks/${encodeURIComponent(network)}/tokens/${encodeURIComponent(tokenAddress)}/pools`),
                {
                    headers: this.headers(),
                    params: { page: 1 },
                },
            );
            const pool = selectBestPool(data.data || []);
            const poolAddress = pool?.attributes?.address || pool?.id.split('_').pop();

            setCached(this.poolCache, key, poolAddress, this.resolutionCacheTtlMs());
            return poolAddress;
        } catch {
            setCached(this.poolCache, key, undefined, this.resolutionCacheTtlMs());
            return undefined;
        }
    }

    private async getPoolHistory(
        network: string,
        poolAddress: string,
        timeframe: MarketComparisonTimeframe,
    ): Promise<MarketHistoryPoint[]> {
        const request = ohlcvRequestConfig(timeframe);
        const key = `${network}:${poolAddress}:${timeframe}`;
        const cached = getCached(this.historyCache, key);
        if (cached.hit) {
            return cached.value;
        }

        try {
            if (!this.reserveRequestSlot()) {
                return [];
            }

            const { data } = await this.httpService.axiosRef.get<GeckoTerminalOhlcvResponse>(
                this.url(
                    `/networks/${encodeURIComponent(network)}/pools/${encodeURIComponent(poolAddress)}/ohlcv/${
                        request.timeframe
                    }`,
                ),
                {
                    headers: this.headers(),
                    params: {
                        aggregate: request.aggregate,
                        limit: request.limit,
                        currency: 'usd',
                    },
                },
            );
            const history = normalizeOhlcv(data.data?.attributes?.ohlcv_list || []);

            setCached(this.historyCache, key, history, this.historyCacheTtlMs());
            return history;
        } catch {
            setCached(this.historyCache, key, [], this.historyCacheTtlMs());
            return [];
        }
    }

    private url(path: string): string {
        const baseUrl = this.configService.get<string>('GECKOTERMINAL_API_URL') || defaultBaseUrl;
        return `${baseUrl.replace(/\/$/, '')}${path}`;
    }

    private headers(): Record<string, string> {
        const version = this.configService.get<string>('GECKOTERMINAL_API_VERSION') || defaultVersion;
        return {
            Accept: `application/json;version=${version}`,
        };
    }

    private historyCacheTtlMs(): number {
        return positiveNumber(this.configService.get<string>('MARKET_HISTORY_CACHE_TTL_MS'), defaultHistoryTtlMs);
    }

    private resolutionCacheTtlMs(): number {
        return positiveNumber(
            this.configService.get<string>('MARKET_HISTORY_RESOLUTION_CACHE_TTL_MS'),
            defaultResolutionTtlMs,
        );
    }

    private reserveRequestSlot(): boolean {
        const now = Date.now();
        const windowStart = now - 60_000;
        while (this.requestTimestamps[0] && this.requestTimestamps[0] < windowStart) {
            this.requestTimestamps.shift();
        }

        if (this.requestTimestamps.length >= this.rateLimitPerMinute()) {
            return false;
        }

        this.requestTimestamps.push(now);
        return true;
    }

    private rateLimitPerMinute(): number {
        return positiveNumber(this.configService.get<string>('GECKOTERMINAL_RATE_LIMIT_PER_MINUTE'), 30);
    }
}

function resolveNetwork(blockchain: string): string | undefined {
    return networkByBlockchain[blockchain.trim().toLowerCase()];
}

function normalizeTokenAddress(contractAddress?: string): string | undefined {
    const value = contractAddress?.trim();
    return value || undefined;
}

function selectBestPool(pools: GeckoTerminalPool[]): GeckoTerminalPool | undefined {
    return [...pools].sort((left, right) => poolScore(right) - poolScore(left))[0];
}

function poolScore(pool: GeckoTerminalPool): number {
    return toNumber(pool.attributes?.reserve_in_usd) || toNumber(pool.attributes?.volume_usd?.h24) || 0;
}

function ohlcvRequestConfig(timeframe: MarketComparisonTimeframe): OhlcvRequestConfig {
    if (timeframe === '1H') {
        return { timeframe: 'minute', aggregate: 5, limit: 12 };
    }

    if (timeframe === '1D') {
        return { timeframe: 'hour', aggregate: 1, limit: 24 };
    }

    return { timeframe: 'day', aggregate: 1, limit: 7 };
}

function normalizeOhlcv(items: [number, number, number, number, number, number][]): MarketHistoryPoint[] {
    return items
        .map(([time, , , , close]) => ({
            time: Number(time),
            price: Number(close),
        }))
        .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price) && point.price > 0)
        .sort((left, right) => left.time - right.time);
}

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): { hit: boolean; value?: T } {
    const entry = cache.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return { hit: false };
    }

    return { hit: true, value: entry.value };
}

function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number): void {
    cache.set(key, {
        expiresAt: Date.now() + ttlMs,
        value,
    });
}

function positiveNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toNumber(value?: string): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}
