import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosHeaders, AxiosResponse } from 'axios';
import { ChainRpcService } from './chain-rpc.service';

function response(data: unknown, status = 200, headers: Record<string, string> = {}): AxiosResponse<unknown> {
    return { data, status, statusText: 'test', headers, config: { headers: new AxiosHeaders() } };
}
const primary = 'https://primary.example';
const secondary = 'https://secondary.example';
const request = [{ key: 'native', method: 'eth_getBalance', params: ['0x1111', 'latest'] }];

function setup(network = 'eip155:1') {
    const http = new HttpService();
    const post = jest.spyOn(http.axiosRef, 'post');
    const config = new ConfigService({
        CHAIN_RPC_ENDPOINTS_JSON: JSON.stringify({
            [network]: [
                { alias: 'primary', url: primary },
                { alias: 'secondary', url: secondary },
            ],
        }),
    });
    return { service: new ChainRpcService(config, http), post };
}
function rateLimit(retryAfter?: string) {
    return new AxiosError(
        'private upstream text',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        response({ private: 'do not log' }, 429, retryAfter === undefined ? {} : { 'retry-after': retryAfter }),
    );
}

describe('Ethereum RPC rate-limit regression (2026-10-27)', () => {
    afterEach(() => jest.restoreAllMocks());

    it('coalesces identical pending balance reads without retaining completed results', async () => {
        const { service, post } = setup();
        post.mockResolvedValueOnce(response({ result: '0x1' }))
            .mockResolvedValueOnce(response({ result: '0x2a' }))
            .mockResolvedValueOnce(response({ result: '0x2b' }));
        const [first, second] = await Promise.all([
            service.requestBatch('eip155:1', request),
            service.requestBatch('eip155:1', request),
        ]);
        expect(first).toEqual(second);
        expect(post).toHaveBeenCalledTimes(2);
        expect((await service.requestBatch('eip155:1', request)).items[0].result).toBe('0x2b');
        expect(post).toHaveBeenCalledTimes(3);
    });

    it('does not share reads for different wallet parameters', async () => {
        const { service, post } = setup();
        post.mockResolvedValue(response({ result: '0x1' }));
        await Promise.all([
            service.requestBatch('eip155:1', request),
            service.requestBatch('eip155:1', [{ ...request[0], params: ['0x2222', 'latest'] }]),
        ]);
        expect(post).toHaveBeenCalledWith(
            primary,
            expect.objectContaining({ params: ['0x1111', 'latest'] }),
            expect.anything(),
        );
        expect(post).toHaveBeenCalledWith(
            primary,
            expect.objectContaining({ params: ['0x2222', 'latest'] }),
            expect.anything(),
        );
    });

    it.each([
        ['120', 120000],
        ['Tue, 27 Oct 2026 14:02:00 GMT', 120000],
        [undefined, 30000],
        ['invalid', 30000],
        ['-1', 30000],
    ])('immediately cools down a 429 endpoint using Retry-After %s', async (header, delay) => {
        let now = Date.parse('2026-10-27T14:00:00Z');
        jest.spyOn(Date, 'now').mockImplementation(() => now);
        const { service, post } = setup();
        post.mockResolvedValueOnce(response({ result: '0x1' }))
            .mockRejectedValueOnce(rateLimit(header))
            .mockResolvedValueOnce(response({ result: '0x1' }))
            .mockResolvedValueOnce(response({ result: '0x2a' }))
            .mockResolvedValueOnce(response({ result: '0x2b' }))
            .mockResolvedValueOnce(response({ result: '0x1' }))
            .mockResolvedValueOnce(response({ result: '0x2c' }));
        expect((await service.requestBatch('eip155:1', request)).providerAlias).toBe('secondary');
        now += delay - 1;
        expect((await service.requestBatch('eip155:1', request)).providerAlias).toBe('secondary');
        expect(post.mock.calls.filter(([url]) => url === primary)).toHaveLength(2);
        now += 2;
        expect((await service.requestBatch('eip155:1', request)).providerAlias).toBe('primary');
    });

    it.each([
        [
            '429 then 503',
            rateLimit('120'),
            new AxiosError('unavailable', undefined, undefined, undefined, response({}, 503)),
        ],
        [
            '503 then 429',
            new AxiosError('unavailable', undefined, undefined, undefined, response({}, 503)),
            rateLimit('120'),
        ],
        ['long then short Retry-After', rateLimit('120'), rateLimit('30')],
        ['short then long Retry-After', rateLimit('30'), rateLimit('120')],
    ])('preserves the longest rate-limit cooldown across concurrent failures: %s', async (_name, first, second) => {
        let now = Date.parse('2026-10-27T14:00:00Z');
        jest.spyOn(Date, 'now').mockImplementation(() => now);
        const { service, post } = setup();
        post.mockResolvedValueOnce(response({ result: '0x1' }))
            .mockRejectedValueOnce(first)
            .mockImplementationOnce(() => new Promise((_resolve, reject) => setTimeout(() => reject(second), 0)))
            .mockResolvedValue(response({ result: '0x1' }));
        const batch = [...request, { ...request[0], key: 'other', params: ['0x2222', 'latest'] }];
        expect((await service.requestBatch('eip155:1', batch)).providerAlias).toBe('secondary');
        now += 119999;
        expect((await service.requestBatch('eip155:1', batch)).providerAlias).toBe('secondary');
        expect(post.mock.calls.filter(([url]) => url === primary)).toHaveLength(3);
        now += 2;
        expect((await service.requestBatch('eip155:1', batch)).providerAlias).toBe('primary');
    });

    it.each([
        {
            network: 'near:mainnet',
            verification: { chain_id: 'mainnet' },
            method: 'query',
            params: { request_type: 'view_account', account_id: 'alice.near', finality: 'final' },
        },
        { network: 'eip155:8453', verification: '0x2105', method: 'eth_getBalance', params: ['0x1111', 'latest'] },
    ])(
        'applies HTTP rate-limit cooldown to single reads on $network',
        async ({ network, verification, method, params }) => {
            const { service, post } = setup(network);
            post.mockResolvedValueOnce(response({ result: verification }))
                .mockRejectedValueOnce(rateLimit('120'))
                .mockResolvedValueOnce(response({ result: verification }))
                .mockResolvedValue(response({ result: 'balance' }));
            expect((await service.request(network, method, params)).providerAlias).toBe('secondary');
            expect((await service.request(network, method, params)).providerAlias).toBe('secondary');
            expect(post.mock.calls.filter(([url]) => url === primary)).toHaveLength(2);
        },
    );

    it.each([
        { code: -32005, message: 'Limit exceeded' },
        { code: -32000, message: 'Too many requests' },
    ])('cools down rate limits delivered inside JSON-RPC: %j', async (error) => {
        const { service, post } = setup();
        post.mockResolvedValueOnce(response({ result: '0x1' }))
            .mockResolvedValueOnce(response({ error }))
            .mockResolvedValueOnce(response({ result: '0x1' }))
            .mockResolvedValue(response({ result: '0x2a' }));
        expect((await service.requestBatch('eip155:1', request)).providerAlias).toBe('secondary');
        expect((await service.requestBatch('eip155:1', request)).providerAlias).toBe('secondary');
        expect(post.mock.calls.filter(([url]) => url === primary)).toHaveLength(2);
    });

    it('does not treat a provider-specific error code alone as rate-limit evidence', async () => {
        const network = 'near:mainnet';
        const genesis = { chain_id: 'mainnet' };
        const { service, post } = setup(network);
        post.mockResolvedValueOnce(response({ result: genesis }))
            .mockResolvedValueOnce(response({ error: { code: -32005, message: 'Node is unhealthy' } }))
            .mockResolvedValueOnce(response({ result: genesis }))
            .mockResolvedValueOnce(response({ result: 'balance' }))
            .mockResolvedValueOnce(response({ result: genesis }))
            .mockResolvedValueOnce(response({ result: 'balance' }));
        expect(
            (
                await service.request(network, 'query', {
                    request_type: 'view_account',
                    account_id: 'alice.near',
                    finality: 'final',
                })
            ).providerAlias,
        ).toBe('secondary');
        expect(
            (
                await service.request(network, 'query', {
                    request_type: 'view_account',
                    account_id: 'alice.near',
                    finality: 'final',
                })
            ).providerAlias,
        ).toBe('primary');
    });

    it('keeps token execution-limit errors local to the failed item', async () => {
        const { service, post } = setup();
        const providerError = { code: 3, message: 'execution reverted: gas limit exceeded' };
        post.mockResolvedValueOnce(response({ result: '0x1' }))
            .mockResolvedValueOnce(response({ error: providerError }))
            .mockResolvedValue(response({ result: '0x2a' }));
        const tokenRead = [{ key: 'token', method: 'eth_call', params: [{ to: '0x1111' }, 'latest'] }];
        expect(await service.requestBatch('eip155:1', tokenRead)).toEqual({
            providerAlias: 'primary',
            items: [{ key: 'token', error: 'RPC provider rejected the request', providerError }],
        });
        expect((await service.requestBatch('eip155:1', request)).providerAlias).toBe('primary');
        expect(post.mock.calls.every(([url]) => url === primary)).toBe(true);
    });

    it('does not coalesce methods outside the explicit read allowlist', async () => {
        const { service, post } = setup();
        post.mockResolvedValue(response({ result: '0x1' }));
        const writes = [{ key: 'write', method: 'eth_sendRawTransaction', params: ['signed-transaction'] }];
        await Promise.all([service.requestBatch('eip155:1', writes), service.requestBatch('eip155:1', writes)]);
        expect(
            post.mock.calls.filter(
                ([, body]) =>
                    body && typeof body === 'object' && 'method' in body && body.method === 'eth_sendRawTransaction',
            ),
        ).toHaveLength(2);
    });

    it('releases failed pending reads so a later request can recover', async () => {
        const { service, post } = setup();
        post.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'));
        const results = await Promise.allSettled([
            service.requestBatch('eip155:1', request),
            service.requestBatch('eip155:1', request),
        ]);
        expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
        expect(post).toHaveBeenCalledTimes(2);
        post.mockResolvedValueOnce(response({ result: '0x1' })).mockResolvedValueOnce(response({ result: '0x2a' }));
        await expect(service.requestBatch('eip155:1', request)).resolves.toMatchObject({ providerAlias: 'primary' });
    });

    it('stays unavailable without hammering either rate-limited endpoint during cooldown', async () => {
        let now = Date.parse('2026-10-27T14:00:00Z');
        jest.spyOn(Date, 'now').mockImplementation(() => now);
        const { service, post } = setup();
        post.mockResolvedValueOnce(response({ result: '0x1' }))
            .mockRejectedValueOnce(rateLimit('120'))
            .mockResolvedValueOnce(response({ result: '0x1' }))
            .mockRejectedValueOnce(rateLimit('120'));
        await expect(service.requestBatch('eip155:1', request)).rejects.toThrow('rate limited');
        now += 119000;
        await expect(service.requestBatch('eip155:1', request)).rejects.toThrow('No healthy RPC endpoint');
        expect(post).toHaveBeenCalledTimes(4);
        now += 1001;
        post.mockResolvedValueOnce(response({ result: '0x1' })).mockResolvedValueOnce(response({ result: '0x2a' }));
        await expect(service.requestBatch('eip155:1', request)).resolves.toMatchObject({ providerAlias: 'primary' });
    });

    it('does not let an older in-flight success cancel a rate-limit cooldown', async () => {
        const { service, post } = setup();
        post.mockResolvedValueOnce(response({ result: '0x1' })).mockResolvedValueOnce(response({ result: '0x1' }));
        await service.request('eip155:1', 'eth_chainId', []);
        let finish!: (value: AxiosResponse<unknown>) => void;
        post.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        )
            .mockRejectedValueOnce(rateLimit('120'))
            .mockResolvedValueOnce(response({ result: '0x1' }))
            .mockResolvedValueOnce(response({ result: '0x2a' }))
            .mockResolvedValueOnce(response({ result: '0x2b' }));
        const older = service.request('eip155:1', 'eth_getBalance', ['0x1111', 'latest']);
        await service.requestBatch('eip155:1', request);
        finish(response({ result: '0x2a' }));
        await older;
        expect((await service.requestBatch('eip155:1', request)).providerAlias).toBe('secondary');
        expect(post.mock.calls.at(-1)?.[0]).toBe(secondary);
    });
});
