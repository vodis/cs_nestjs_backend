import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosHeaders } from 'axios';
import { ChainBalanceService } from './chain-balance.service';
import { ChainRpcService } from './rpc/chain-rpc.service';
import { TonCenterService } from './ton/ton-center.service';

const contract = '0x1111111111111111111111111111111111111111';
const wallet = { address: '0x2222222222222222222222222222222222222222', chainType: 'ethereum' };

describe.each([
    ['eip155:1', 'eth', '0x1'],
    ['eip155:8453', 'base', '0x2105'],
])('balance outcomes on %s', (network, blockchain, chainId) => {
    afterEach(() => jest.restoreAllMocks());

    it.each([
        [{ result: '0x0' }, '0'],
        [{ result: '0x2a' }, '42'],
        [{ result: '0x' }, undefined],
        [{ error: { code: 3, message: 'execution reverted' } }, undefined],
        [
            {
                error: {
                    name: 'HANDLER_ERROR',
                    cause: { name: 'UNKNOWN_ACCOUNT', info: { requested_account_id: contract } },
                },
            },
            undefined,
        ],
    ])('keeps known balances separate from unavailable tokens (%j)', async (tokenResponse, expected) => {
        const http = new HttpService();
        const config = new ConfigService({
            CHAIN_RPC_ENDPOINTS_JSON: JSON.stringify({ [network]: [{ alias: 'test', url: 'https://rpc.example' }] }),
        });
        const post = jest.spyOn(http.axiosRef, 'post');
        for (const data of [{ result: chainId }, { result: '0x2a' }, tokenResponse]) {
            post.mockResolvedValueOnce({
                data,
                status: 200,
                statusText: 'OK',
                headers: {},
                config: { headers: new AxiosHeaders() },
            });
        }
        const service = new ChainBalanceService(
            new ChainRpcService(config, http),
            config,
            new TonCenterService(http, config),
        );
        const token = {
            assetId: 'test-token',
            defuseAssetId: 'test-token',
            symbol: 'TOKEN',
            decimals: 6,
            blockchain,
            contractAddress: contract,
        };
        const result = await service.getBalances(wallet, network, [undefined, token]);
        expect(result.balances[0]).toMatchObject({ assetId: `${network}/native`, balanceRaw: '42' });
        if (expected === undefined) {
            expect(result.balances).toHaveLength(1);
            expect(result.failures).toEqual([{ assetId: token.assetId, reason: expect.any(String) }]);
        } else {
            expect(result.balances[1]).toMatchObject({ assetId: token.assetId, balanceRaw: expected });
            expect(result.failures).toEqual([]);
        }
    });
});

describe('RPC error evidence boundary', () => {
    afterEach(() => jest.restoreAllMocks());

    it.each(['request', 'requestBatch'] as const)('sanitizes errors escaping %s', async (operation) => {
        const http = new HttpService();
        const config = new ConfigService({
            CHAIN_RPC_ENDPOINTS_JSON: JSON.stringify({
                'eip155:1': [{ alias: 'test', url: 'https://rpc.example' }],
            }),
        });
        const post = jest.spyOn(http.axiosRef, 'post');
        // Single request fails after verification; batch verification itself fails.
        if (operation === 'request') post.mockResolvedValueOnce({ data: { result: '0x1' } });
        post.mockResolvedValueOnce({
            data: { error: { code: 3, message: 'private-provider-marker', data: 'private-provider-marker' } },
        });
        const rpc = new ChainRpcService(config, http);
        const pending =
            operation === 'request'
                ? rpc.request('eip155:1', 'eth_call', [])
                : rpc.requestBatch('eip155:1', [{ key: 'token', method: 'eth_call', params: [] }]);
        await expect(pending).rejects.toThrow('RPC provider rejected the request');
        await expect(pending).rejects.toMatchObject({ providerError: undefined });
    });
});
