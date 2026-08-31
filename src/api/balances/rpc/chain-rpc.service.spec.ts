import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ChainRpcService } from './chain-rpc.service';

const endpointConfig = JSON.stringify({
    'near:mainnet': [
        { alias: 'near-primary', url: 'https://primary.rpc.example' },
        { alias: 'near-secondary', url: 'https://secondary.rpc.example' },
    ],
});

function createService(values: Record<string, unknown> = {}) {
    const post = jest.fn();
    const http = { axiosRef: { post } } as unknown as HttpService;
    const config = new ConfigService({ CHAIN_RPC_ENDPOINTS_JSON: endpointConfig, ...values });
    return { service: new ChainRpcService(config, http), post };
}

describe('ChainRpcService', () => {
    it('retries an entire batch on the secondary after a retryable primary failure', async () => {
        const { service, post } = createService();
        post.mockResolvedValueOnce({ data: { result: { chain_id: 'mainnet' } } });
        post.mockRejectedValueOnce({ isAxiosError: true, code: 'ECONNABORTED' });
        post.mockResolvedValueOnce({ data: { result: { chain_id: 'mainnet' } } });
        post.mockImplementationOnce(async (_url, body) => ({
            data: body.map((item) => ({ jsonrpc: '2.0', id: item.id, result: { amount: '42' } })),
        }));

        const result = await service.requestBatch('near:mainnet', [
            { key: 'near:native', method: 'query', params: { request_type: 'view_account' } },
        ]);

        expect(result.providerAlias).toBe('near-secondary');
        expect(result.items).toEqual([{ key: 'near:native', result: { amount: '42' } }]);
        expect(post.mock.calls.map((call) => call[0])).toEqual([
            'https://primary.rpc.example',
            'https://primary.rpc.example',
            'https://secondary.rpc.example',
            'https://secondary.rpc.example',
        ]);
    });

    it('rejects a wrong-chain primary and uses a verified secondary', async () => {
        const { service, post } = createService();
        post.mockResolvedValueOnce({ data: { result: { chain_id: 'testnet' } } });
        post.mockResolvedValueOnce({ data: { result: { chain_id: 'mainnet' } } });
        post.mockResolvedValueOnce({ data: { result: { amount: '7' } } });

        const result = await service.request<{ amount: string }>('near:mainnet', 'query', {});

        expect(result).toEqual({ result: { amount: '7' }, providerAlias: 'near-secondary' });
    });

    it.each([
        ['eip155:56', '0x38'],
        ['eip155:8453', '0x2105'],
    ])('verifies independently configured EVM network %s', async (network, rpcChainId) => {
        const { service, post } = createService({
            CHAIN_RPC_ENDPOINTS_JSON: JSON.stringify({
                [network]: [{ alias: 'evm-primary', url: 'https://evm.rpc.example' }],
            }),
        });
        post.mockResolvedValueOnce({ data: { result: rpcChainId } });
        post.mockResolvedValueOnce({ data: { result: '0x2a' } });

        const result = await service.request<string>(network, 'eth_getBalance', []);

        expect(result).toEqual({ result: '0x2a', providerAlias: 'evm-primary' });
        expect(post.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'eth_chainId' }));
    });

    it('rejects an endpoint for a different EVM network and verifies the next provider', async () => {
        const { service, post } = createService({
            CHAIN_RPC_ENDPOINTS_JSON: JSON.stringify({
                'eip155:8453': [
                    { alias: 'wrong-network', url: 'https://wrong.rpc.example' },
                    { alias: 'base-primary', url: 'https://base.rpc.example' },
                ],
            }),
        });
        post.mockResolvedValueOnce({ data: { result: '0x1' } });
        post.mockResolvedValueOnce({ data: { result: '0x2105' } });
        post.mockResolvedValueOnce({ data: { result: '0x2a' } });

        const result = await service.request<string>('eip155:8453', 'eth_getBalance', []);

        expect(result).toEqual({ result: '0x2a', providerAlias: 'base-primary' });
        expect(post.mock.calls.map((call) => call[0])).toEqual([
            'https://wrong.rpc.example',
            'https://base.rpc.example',
            'https://base.rpc.example',
        ]);
    });

    it('rejects an unsupported CAIP-2 namespace during endpoint configuration', () => {
        expect(() =>
            createService({
                CHAIN_RPC_ENDPOINTS_JSON: JSON.stringify({
                    'solana:mainnet': [{ alias: 'solana-primary', url: 'https://solana.rpc.example' }],
                }),
            }),
        ).toThrow('Invalid RPC endpoint list for solana:mainnet');
    });

    it('keeps deterministic batch item errors as partial results', async () => {
        const { service, post } = createService();
        post.mockResolvedValueOnce({ data: { result: { chain_id: 'mainnet' } } });
        post.mockImplementationOnce(async (_url, body) => ({
            data: [
                { jsonrpc: '2.0', id: body[0].id, result: { amount: '7' } },
                { jsonrpc: '2.0', id: body[1].id, error: { code: -32602, message: 'Unknown contract' } },
            ],
        }));

        const result = await service.requestBatch('near:mainnet', [
            { key: 'near:native', method: 'query', params: {} },
            { key: 'nep141:missing.near', method: 'query', params: {} },
        ]);

        expect(result.items).toEqual([
            { key: 'near:native', result: { amount: '7' } },
            { key: 'nep141:missing.near', error: 'RPC provider rejected the batch item' },
        ]);
        expect(post).toHaveBeenCalledTimes(2);
    });

    it('opens the primary circuit and skips it until cooldown', async () => {
        const { service, post } = createService({ RPC_FAILURE_THRESHOLD: 1, RPC_COOLDOWN_MS: 60000 });
        post.mockResolvedValueOnce({ data: { result: { chain_id: 'mainnet' } } });
        post.mockRejectedValueOnce({ isAxiosError: true, response: { status: 503 } });
        post.mockResolvedValueOnce({ data: { result: { chain_id: 'mainnet' } } });
        post.mockResolvedValueOnce({ data: { result: { amount: '1' } } });
        post.mockResolvedValueOnce({ data: { result: { amount: '2' } } });

        await service.request('near:mainnet', 'query', {});
        const second = await service.request<{ amount: string }>('near:mainnet', 'query', {});

        expect(second.providerAlias).toBe('near-secondary');
        expect(second.result.amount).toBe('2');
        expect(post.mock.calls.filter((call) => call[0] === 'https://primary.rpc.example')).toHaveLength(2);
    });

    it('fails closed when production does not provide the secret endpoint map', () => {
        const post = jest.fn();
        const service = new ChainRpcService(
            new ConfigService({ NODE_ENV: 'production', NEAR_RPC_URL: 'https://rpc.mainnet.near.org' }),
            { axiosRef: { post } } as unknown as HttpService,
        );
        expect(() => service.onModuleInit()).toThrow('CHAIN_RPC_ENDPOINTS_JSON is required in production');
    });
});
