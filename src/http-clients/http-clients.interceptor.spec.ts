import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { firstValueFrom, from } from 'rxjs';
import { HttpServiceInterceptor, onHttpModuleInit } from './http-clients.interceptor';

describe('provider diagnostics', () => {
    afterEach(() => jest.restoreAllMocks());

    it.each([
        [400, undefined, 'rejected', 'warn'],
        [429, undefined, 'rate_limited', 'warn'],
        [521, undefined, 'upstream_unavailable', 'error'],
        [undefined, 'ECONNABORTED', 'timeout', 'error'],
        [undefined, 'ECONNRESET', 'transport_error', 'error'],
    ] as const)(
        'classifies status %s and code %s without logging sensitive content',
        async (status, code, outcome, level) => {
            const log = jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
            const secret = 'sentinel-private-value';
            const client = axios.create({
                adapter: async (config) => {
                    throw new AxiosError(
                        secret,
                        code,
                        config,
                        undefined,
                        status === undefined
                            ? undefined
                            : {
                                  status,
                                  statusText: secret,
                                  data: { secret },
                                  headers: { authorization: secret },
                                  config,
                              },
                    );
                },
            });
            onHttpModuleInit(new HttpService(client));
            await expect(
                client.post(
                    `https://user:${secret}@1click.chaindefuser.com/v0/quote?key=${secret}`,
                    {
                        signedData: secret,
                    },
                    { headers: { Authorization: `Bearer ${secret}`, 'X-Request-Id': secret } },
                ),
            ).rejects.toBeInstanceOf(AxiosError);
            expect(log).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'provider_request',
                    provider: 'one_click',
                    operation: 'quote',
                    outcome,
                    statusCode: status,
                    durationMs: expect.any(Number),
                    requestId: expect.any(String),
                }),
            );
            expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
        },
    );

    it('identifies Hyperliquid operations without logging the body', async () => {
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        const client = axios.create({
            adapter: async (config) => ({ data: [], status: 200, statusText: 'OK', headers: {}, config }),
        });
        onHttpModuleInit(new HttpService(client));
        await client.post('https://api.hyperliquid.xyz/info', { type: 'candleSnapshot', req: { coin: 'PRIVATE' } });
        expect(log).toHaveBeenCalledWith(
            expect.objectContaining({ provider: 'hyperliquid', operation: 'candles', outcome: 'success' }),
        );
        expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE');
    });

    it('handles an unexpected error without serializing it', async () => {
        const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const client = axios.create({
            adapter: async () => {
                throw new Error('private-body');
            },
        });
        onHttpModuleInit(new HttpService(client));
        await expect(client.get('https://example.com/private-path')).rejects.toThrow('private-body');
        expect(log).toHaveBeenCalledWith(expect.objectContaining({ provider: 'other', outcome: 'transport_error' }));
        expect(JSON.stringify(log.mock.calls)).not.toContain('private');
    });
    it('isolates request correlation across concurrent HTTP requests', async () => {
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        const client = axios.create({
            adapter: async (config) => {
                await Promise.resolve();
                return { data: config.headers.get('X-Request-Id'), status: 200, statusText: 'OK', headers: {}, config };
            },
        });
        onHttpModuleInit(new HttpService(client));
        const interceptor = new HttpServiceInterceptor();
        const first = { setHeader: jest.fn() };
        const second = { setHeader: jest.fn() };
        const run = (response: typeof first) =>
            firstValueFrom(
                interceptor.intercept(new ExecutionContextHost([{}, response]), {
                    handle: () =>
                        from(client.get('https://1click.chaindefuser.com/v0/tokens').then((result) => result.data)),
                }),
            );
        const [a, b] = await Promise.all([run(first), run(second)]);
        expect(a).not.toBe(b);
        expect(first.setHeader).toHaveBeenCalledWith('X-Request-Id', a);
        expect(second.setHeader).toHaveBeenCalledWith('X-Request-Id', b);
        expect(log).toHaveBeenCalledWith(expect.objectContaining({ requestId: a }));
        expect(log).toHaveBeenCalledWith(expect.objectContaining({ requestId: b }));
        expect(client.defaults.headers.common['X-Request-Id']).toBeUndefined();
    });
});
