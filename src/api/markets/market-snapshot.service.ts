import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { coinGeckoIdForSymbol } from './coingecko-ids';
import {
    CoinGeckoMarketCoin,
    CoinGeckoMarketSnapshotClient,
    CoinGeckoRequestError,
} from './coingecko-market-snapshot.client';
import { GetMarketSnapshotsResponseDto, MarketSnapshotDto } from './dto/get-market-snapshots-response.dto';

const maxSymbols = 30;
const maxSparklinePoints = 48;
const emptySparkline = [0, 0];

type CachedMarket = {
    snapshot: Omit<MarketSnapshotDto, 'symbol'> | null;
    expiresAt: number;
    fetchedAt: string;
};

type RefreshOutcome = 'cached' | 'fetched' | 'failed';

@Injectable()
export class MarketSnapshotService {
    private readonly logger = new Logger(MarketSnapshotService.name);
    private readonly cache = new Map<string, CachedMarket>();
    private tail: Promise<void> = Promise.resolve();

    constructor(
        private readonly coinGeckoMarketSnapshotClient: CoinGeckoMarketSnapshotClient,
        private readonly configService: ConfigService,
    ) {}

    async getSnapshots(symbolsQuery: string): Promise<GetMarketSnapshotsResponseDto> {
        const symbols = this.normalizeSymbols(symbolsQuery);
        const fetchedAt = new Date().toISOString();

        if (!this.coinGeckoMarketSnapshotClient.hasApiKey()) {
            return this.toResponse(
                symbols.map((symbol) => this.emptySnapshot(symbol)),
                'unavailable',
                false,
                fetchedAt,
            );
        }

        const resolved = symbols.map((symbol) => ({ symbol, id: this.resolveId(symbol) }));
        const ids = [...new Set(resolved.flatMap((item) => (item.id ? [item.id] : [])))];
        if (ids.length === 0) {
            return this.toResponse(
                resolved.map((item) => this.emptySnapshot(item.symbol)),
                'unavailable',
                false,
                fetchedAt,
            );
        }

        const outcome = ids.every((id) => this.isFresh(id)) ? 'cached' : await this.enqueue(() => this.refresh(ids));
        const hasCachedSnapshot = ids.some((id) => Boolean(this.cache.get(id)?.snapshot));
        const unavailable = outcome === 'failed' && !hasCachedSnapshot;

        return this.toResponse(
            resolved.map((item) => this.snapshotFor(item.symbol, item.id)),
            unavailable ? 'unavailable' : 'coingecko',
            outcome === 'cached' || (outcome === 'failed' && hasCachedSnapshot),
            this.latestFetchedAt(ids) || fetchedAt,
        );
    }

    private async refresh(ids: string[]): Promise<RefreshOutcome> {
        const missing = ids.filter((id) => !this.isFresh(id));
        if (missing.length === 0) {
            return 'cached';
        }

        try {
            const markets = await this.coinGeckoMarketSnapshotClient.getMarkets(missing);
            const byId = new Map(markets.map((market) => [market.id, market]));
            const now = Date.now();
            const expiresAt = now + this.cacheTtlMs();
            const fetchedAt = new Date(now).toISOString();

            for (const id of missing) {
                this.cache.set(id, {
                    snapshot: this.toCachedSnapshot(byId.get(id)) ?? null,
                    expiresAt,
                    fetchedAt,
                });
            }

            return 'fetched';
        } catch (error) {
            this.logger.error(this.failureLog(error));
            return 'failed';
        }
    }

    private snapshotFor(symbol: string, id?: string): MarketSnapshotDto {
        const cached = id ? this.cache.get(id) : undefined;
        if (!cached?.snapshot) {
            return this.emptySnapshot(symbol);
        }

        return { symbol, ...cached.snapshot };
    }

    private toCachedSnapshot(market?: CoinGeckoMarketCoin): Omit<MarketSnapshotDto, 'symbol'> | undefined {
        const priceUsd = finiteNumber(market?.current_price);
        if (priceUsd === undefined) {
            return undefined;
        }

        return {
            priceUsd,
            change24hPercent: finiteNumber(market?.price_change_percentage_24h) ?? 0,
            marketCapUsd: finiteNumber(market?.market_cap) ?? 0,
            volume24hUsd: finiteNumber(market?.total_volume) ?? 0,
            sparkline7d: this.sparkline(market?.sparkline_in_7d?.price),
        };
    }

    private sparkline(values?: number[]): number[] {
        const clean = (values || []).filter((value) => Number.isFinite(value));
        if (clean.length < 2) {
            return [...emptySparkline];
        }
        if (clean.length <= maxSparklinePoints) {
            return clean;
        }

        const step = (clean.length - 1) / (maxSparklinePoints - 1);
        return Array.from({ length: maxSparklinePoints }, (_, index) => clean[Math.round(index * step)]);
    }

    private emptySnapshot(symbol: string): MarketSnapshotDto {
        return {
            symbol,
            priceUsd: 0,
            change24hPercent: 0,
            marketCapUsd: 0,
            volume24hUsd: 0,
            sparkline7d: [...emptySparkline],
        };
    }

    private normalizeSymbols(symbolsQuery: string): string[] {
        const symbols = [
            ...new Set(
                symbolsQuery
                    .split(',')
                    .map((symbol) => symbol.trim().toUpperCase())
                    .filter((symbol) => /^[A-Z0-9]{1,20}$/.test(symbol)),
            ),
        ];

        if (symbols.length === 0) {
            throw new BadRequestException('At least one symbol is required');
        }
        if (symbols.length > maxSymbols) {
            throw new BadRequestException(`At most ${maxSymbols} symbols are allowed`);
        }

        return symbols;
    }

    private resolveId(symbol: string): string | undefined {
        return coinGeckoIdForSymbol(symbol, this.configService.get<string>(`MARKET_COINGECKO_ID_${symbol}`));
    }

    private isFresh(id: string): boolean {
        const cached = this.cache.get(id);
        return Boolean(cached && cached.expiresAt > Date.now());
    }

    private latestFetchedAt(ids: string[]): string | undefined {
        return ids
            .map((id) => this.cache.get(id)?.fetchedAt)
            .filter((value): value is string => Boolean(value))
            .sort()
            .at(-1);
    }

    private cacheTtlMs(): number {
        const value = Number(this.configService.get('MARKET_SNAPSHOT_CACHE_TTL_MS') || 300000);
        return Number.isFinite(value) && value > 0 ? value : 300000;
    }

    private enqueue<T>(work: () => Promise<T>): Promise<T> {
        const run = this.tail.then(work, work);
        this.tail = run.then(
            () => undefined,
            () => undefined,
        );
        return run;
    }

    private toResponse(
        data: MarketSnapshotDto[],
        source: GetMarketSnapshotsResponseDto['meta']['source'],
        cached: boolean,
        fetchedAt: string,
    ): GetMarketSnapshotsResponseDto {
        return {
            data,
            meta: { source, cached, fetchedAt },
        };
    }

    private failureLog(error: unknown): string {
        if (error instanceof CoinGeckoRequestError) {
            const status = error.status ? ` status=${error.status}` : '';
            return `CoinGecko market snapshot failed${status}: ${error.message}`;
        }

        return `CoinGecko market snapshot failed: ${error instanceof Error ? error.message : 'unknown error'}`;
    }
}

function finiteNumber(value: number | null | undefined): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
