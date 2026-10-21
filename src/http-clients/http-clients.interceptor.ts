import { HttpService } from '@nestjs/axios';
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor, Provider } from '@nestjs/common';
import { Observable } from 'rxjs';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AxiosRequestConfig, isAxiosError } from 'axios';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';

const diagnosticContexts = new WeakMap<object, { startedAt: number; requestId: string }>();

const requestContext = new AsyncLocalStorage<string>();
const marketHistoryLogger = new Logger('MarketHistory');

@Injectable()
export class HttpServiceInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        if (context.getType() !== 'http') return next.handle();
        // Generate our own identifier: client headers can contain secrets or log injection.
        const requestId = randomUUID();
        context.switchToHttp().getResponse<Response>().setHeader('X-Request-Id', requestId);
        return new Observable((subscriber) => requestContext.run(requestId, () => next.handle().subscribe(subscriber)));
    }
}

export const onHttpModuleInit = (httpService: HttpService): void => {
    const logger = new Logger('Axios');
    httpService.axiosRef.interceptors.request.use((config) => {
        const requestId = requestContext.getStore() || randomUUID();
        diagnosticContexts.set(config, { startedAt: Date.now(), requestId });
        config.headers.set('X-Request-Id', requestId);
        return config;
    });
    httpService.axiosRef.interceptors.response.use(
        (response) => {
            logger.log(diagnostic(response.config, response.status, 'success'));
            return response;
        },
        (error: unknown) => {
            const config = isAxiosError(error) ? error.config : undefined;
            const status = isAxiosError(error) ? error.response?.status : undefined;
            const code = isAxiosError(error) ? error.code : undefined;
            const outcome = classifyFailure(status, code);
            const record = diagnostic(config, status, outcome);
            if (outcome === 'rejected' || outcome === 'rate_limited') logger.warn(record);
            else logger.error(record);
            // Never serialize the Axios error: it contains headers, bodies and signed payloads.
            return Promise.reject(error);
        },
    );
};

function classifyFailure(status?: number, code?: string): string {
    if (status === 429) return 'rate_limited';
    if (status !== undefined && status >= 500) return 'upstream_unavailable';
    if (status !== undefined && status >= 400) return 'rejected';
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return 'timeout';
    if (code === 'ERR_CANCELED') return 'cancelled';
    return 'transport_error';
}

function diagnostic(config: AxiosRequestConfig | undefined, status: number | undefined, outcome: string) {
    const context = config ? diagnosticContexts.get(config) : undefined;
    return {
        event: 'provider_request',
        ...providerOperation(config),
        requestId: context?.requestId || requestContext.getStore(),
        durationMs: context ? Math.max(0, Date.now() - context.startedAt) : undefined,
        statusCode: status,
        outcome,
    };
}

function providerOperation(config?: AxiosRequestConfig): { provider: string; operation: string } {
    // Only emit known labels, never URLs, query strings, headers or arbitrary body values.
    try {
        const url = new URL(config?.url || '', config?.baseURL);
        if (url.hostname === '1click.chaindefuser.com') {
            const operations: Record<string, string> = {
                '/v0/tokens': 'tokens',
                '/v0/quote': 'quote',
                '/v0/status': 'status',
                '/v0/generate-intent': 'generate_intent',
                '/v0/submit-intent': 'submit_intent',
            };
            return { provider: 'one_click', operation: operations[url.pathname] || 'other' };
        }
        if (url.hostname === 'api.hyperliquid.xyz') {
            let body: unknown = config?.data;
            if (typeof body === 'string') {
                try {
                    body = JSON.parse(body);
                } catch {
                    body = undefined;
                }
            }
            let operation = 'info';
            if (body && typeof body === 'object' && 'type' in body) {
                if (body.type === 'candleSnapshot') operation = 'candles';
                if (body.type === 'metaAndAssetCtxs') operation = 'asset_context';
            }
            return { provider: 'hyperliquid', operation };
        }
        if (url.hostname === 'api.coingecko.com' || url.hostname === 'pro-api.coingecko.com') {
            return {
                provider: 'coingecko',
                operation: url.pathname.endsWith('/market_chart/range') ? 'history' : 'other',
            };
        }
    } catch {
        /* Unknown endpoints still get duration, outcome and correlation. */
    }
    return { provider: 'other', operation: 'other' };
}

export function logMarketHistoryFallback(provider: 'hyperliquid' | 'coingecko', reason: 'empty' | 'error'): void {
    marketHistoryLogger.warn({
        event: 'market_history_fallback',
        provider,
        reason,
        requestId: requestContext.getStore(),
    });
}

export const HttpServiceInterceptorProvider: Provider = {
    provide: APP_INTERCEPTOR,
    useClass: HttpServiceInterceptor,
};
