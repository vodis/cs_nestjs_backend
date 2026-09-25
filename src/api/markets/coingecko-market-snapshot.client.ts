import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

export interface CoinGeckoMarketCoin {
    id: string;
    current_price: number | null;
    market_cap: number | null;
    total_volume: number | null;
    price_change_percentage_24h: number | null;
    sparkline_in_7d?: { price?: number[] };
}

export class CoinGeckoRequestError extends Error {
    constructor(
        readonly status: number | undefined,
        message: string,
    ) {
        super(message);
        this.name = 'CoinGeckoRequestError';
    }
}

@Injectable()
export class CoinGeckoMarketSnapshotClient {
    constructor(
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
    ) {}

    hasApiKey(): boolean {
        return Boolean(this.apiKey());
    }

    async getMarkets(ids: string[]): Promise<CoinGeckoMarketCoin[]> {
        if (!this.hasApiKey() || ids.length === 0) {
            return [];
        }

        try {
            const { data } = await this.httpService.axiosRef.get<CoinGeckoMarketCoin[]>('/coins/markets', {
                params: {
                    vs_currency: 'usd',
                    ids: ids.join(','),
                    sparkline: true,
                    price_change_percentage: '24h',
                    per_page: ids.length,
                },
                headers: this.authHeaders(),
            });

            return Array.isArray(data) ? data : [];
        } catch (error) {
            throw toCoinGeckoRequestError(error, this.apiKey());
        }
    }

    private apiKey(): string | undefined {
        const key = this.configService.get<string>('COINGECKO_API_KEY')?.trim();
        return key || undefined;
    }

    private authHeaders(): Record<string, string> {
        const key = this.apiKey();
        const baseUrl = this.configService.get<string>('COINGECKO_API_URL') || '';
        const header = baseUrl.includes('pro-api.coingecko.com') ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key';

        return { [header]: key || '' };
    }
}

function toCoinGeckoRequestError(error: unknown, apiKey?: string): CoinGeckoRequestError {
    const response = axiosResponse(error);
    const detail = coinGeckoDetail(response?.data) || (error instanceof Error ? error.message : 'request failed');

    return new CoinGeckoRequestError(response?.status, redactSecret(detail, apiKey).slice(0, 300));
}

function axiosResponse(error: unknown): { status?: number; data?: unknown } | undefined {
    if (!error || typeof error !== 'object' || !('response' in error)) {
        return undefined;
    }

    const response = (error as { response?: { status?: number; data?: unknown } }).response;
    return response && typeof response === 'object' ? response : undefined;
}

function coinGeckoDetail(data: unknown): string | undefined {
    if (typeof data === 'string') {
        return data;
    }
    if (!data || typeof data !== 'object') {
        return undefined;
    }

    const record = data as Record<string, unknown>;
    const status = record.status;
    if (status && typeof status === 'object') {
        const message = (status as Record<string, unknown>).error_message;
        if (typeof message === 'string') {
            return message;
        }
    }
    if (typeof record.error === 'string') {
        return record.error;
    }

    return undefined;
}

function redactSecret(message: string, secret?: string): string {
    const trimmed = secret?.trim();
    if (!trimmed) {
        return message;
    }

    return message.split(trimmed).join('[redacted]');
}
