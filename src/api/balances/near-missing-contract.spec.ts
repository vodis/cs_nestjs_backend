import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosHeaders, AxiosResponse } from 'axios';
import { AssetDto } from '../assets/dto/get-assets-response.dto';
import { ChainBalanceService } from './chain-balance.service';
import { ChainRpcService } from './rpc/chain-rpc.service';
import { TonCenterService } from './ton/ton-center.service';

const token: AssetDto = {
    assetId: 'nep141:missing.near',
    defuseAssetId: 'nep141:missing.near',
    blockchain: 'near',
    symbol: 'TOKEN',
    decimals: 6,
};
const wallet = { address: 'alice.near', chainType: 'near' };

function response(data: unknown): AxiosResponse<unknown> {
    return { data, status: 200, statusText: 'OK', headers: {}, config: { headers: new AxiosHeaders() } };
}

function setup(error: unknown) {
    const config = new ConfigService({
        CHAIN_RPC_ENDPOINTS_JSON: JSON.stringify({
            'near:mainnet': [{ alias: 'near', url: 'https://near.example' }],
        }),
    });
    const http = new HttpService();
    const post = jest
        .spyOn(http.axiosRef, 'post')
        .mockResolvedValueOnce(response({ result: { chain_id: 'mainnet' } }))
        .mockResolvedValueOnce(response({ result: { amount: '2000000000000000000000000' } }))
        .mockResolvedValueOnce(response({ error }));
    const rpc = new ChainRpcService(config, http);
    const service = new ChainBalanceService(rpc, config, new TonCenterService(http, config));
    return { service, post };
}

const missingAccount = (account = 'missing.near') => ({
    code: -32000,
    name: 'HANDLER_ERROR',
    message: 'Server error',
    cause: { name: 'UNKNOWN_ACCOUNT', info: { requested_account_id: account } },
});

describe('NEAR portfolio 503 regression (2026-10-27)', () => {
    afterEach(() => jest.restoreAllMocks());

    it('keeps native holdings when a catalog token contract does not exist', async () => {
        const { service } = setup(missingAccount());
        const result = await service.getBalances(wallet, 'near:mainnet', [undefined, token]);
        expect(result.failures).toEqual([]);
        expect(result.balances).toEqual([
            expect.objectContaining({ assetId: 'near:native', balanceDecimal: '2' }),
            expect.objectContaining({ assetId: token.assetId, balanceRaw: '0', balanceDecimal: '0' }),
        ]);
    });

    it.each([
        missingAccount('different.near'),
        { ...missingAccount(), name: 'INTERNAL_ERROR' },
        { ...missingAccount(), cause: { name: 'UNKNOWN_ACCOUNT' } },
        { ...missingAccount(), cause: { name: 'CONTRACT_EXECUTION_ERROR' } },
        { code: -32000, message: 'UNKNOWN_ACCOUNT missing.near' },
    ])('does not convert an unproven absence or execution error into zero (%j)', async (error) => {
        const { service } = setup(error);
        const result = await service.getBalances(wallet, 'near:mainnet', [undefined, token]);
        expect(result.balances).toHaveLength(1);
        expect(result.failures).toEqual([{ assetId: token.assetId, reason: 'RPC provider rejected the request' }]);
    });

    it('keeps a missing native wallet account unavailable', async () => {
        const { service, post } = setup(missingAccount());
        post.mockReset()
            .mockResolvedValueOnce(response({ result: { chain_id: 'mainnet' } }))
            .mockResolvedValueOnce(response({ error: missingAccount(wallet.address) }));
        const result = await service.getBalances(wallet, 'near:mainnet', [undefined]);
        expect(result.balances).toEqual([]);
        expect(result.failures).toEqual([{ assetId: 'near:native', reason: 'NEAR account does not exist' }]);
    });

    it('does not convert a provider outage into zero', async () => {
        const { service, post } = setup(missingAccount());
        post.mockReset()
            .mockResolvedValueOnce(response({ result: { chain_id: 'mainnet' } }))
            .mockRejectedValueOnce(new Error('unavailable'));
        await expect(service.getBalances(wallet, 'near:mainnet', [token])).rejects.toThrow();
    });
});
