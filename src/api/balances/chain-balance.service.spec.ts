import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssetDto } from '../assets/dto/get-assets-response.dto';
import { WalletLink } from '../../database/models/wallet-link.model';
import { ChainBalanceService } from './chain-balance.service';
import { ChainRpcService } from './rpc/chain-rpc.service';

const usdcNear: AssetDto = {
    assetId: 'nep141:usdc.near',
    defuseAssetId: 'nep141:usdc.near',
    symbol: 'USDC',
    decimals: 6,
    blockchain: 'near',
};
const usdcEthereum: AssetDto = {
    assetId: 'erc20:eth:usdc',
    defuseAssetId: 'erc20:eth:usdc',
    symbol: 'USDC',
    decimals: 6,
    blockchain: 'eth',
    contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
};

function wallet(address: string, chainType: string): WalletLink {
    return { id: 'wallet-1', address, chainType } as WalletLink;
}

describe('ChainBalanceService', () => {
    const config = new ConfigService({ BALANCE_CACHE_TTL_MS: 15000 });

    it('batches native NEAR and NEP-141 ft_balance_of reads', async () => {
        const requestBatch = jest.fn(async (_network, requests) => ({
            providerAlias: 'near-primary',
            items: [
                { key: requests[0].key, result: { amount: '2000000000000000000000000' } },
                { key: requests[1].key, result: { result: [...Buffer.from('"1250000"')] } },
            ],
        }));
        const service = new ChainBalanceService({ requestBatch } as unknown as ChainRpcService, config);

        const result = await service.getBalances(wallet('alice.near', 'near'), 'near:mainnet', [undefined, usdcNear]);

        expect(requestBatch).toHaveBeenCalledWith(
            'near:mainnet',
            expect.arrayContaining([
                expect.objectContaining({ key: 'near:native', method: 'query' }),
                expect.objectContaining({ key: usdcNear.assetId, method: 'query' }),
            ]),
        );
        const tokenRequest = requestBatch.mock.calls[0][1][1];
        expect(tokenRequest.params).toMatchObject({
            request_type: 'call_function',
            account_id: 'usdc.near',
            method_name: 'ft_balance_of',
        });
        expect(result.balances).toEqual([
            expect.objectContaining({ assetId: 'near:native', balanceDecimal: '2' }),
            expect.objectContaining({ assetId: usdcNear.assetId, balanceDecimal: '1.25' }),
        ]);
    });

    it('batches EVM native and ERC-20 balanceOf reads without floating point conversion', async () => {
        const requestBatch = jest.fn(async (_network, requests) => ({
            providerAlias: 'ethereum-primary',
            items: [
                { key: requests[0].key, result: '0xde0b6b3a7640000' },
                { key: requests[1].key, result: '0x1312d00' },
            ],
        }));
        const service = new ChainBalanceService({ requestBatch } as unknown as ChainRpcService, config);
        const evmWallet = wallet('0x1111111111111111111111111111111111111111', 'ethereum');

        const result = await service.getBalances(evmWallet, 'eip155:1', [undefined, usdcEthereum]);

        expect(requestBatch.mock.calls[0][1]).toEqual([
            expect.objectContaining({ method: 'eth_getBalance' }),
            expect.objectContaining({
                method: 'eth_call',
                params: [
                    expect.objectContaining({
                        to: usdcEthereum.contractAddress,
                        data: expect.stringMatching(/^0x70a08231[0-9a-f]{64}$/),
                    }),
                    'latest',
                ],
            }),
        ]);
        expect(result.balances).toEqual([
            expect.objectContaining({ assetId: 'eip155:1/native', balanceRaw: '1000000000000000000' }),
            expect.objectContaining({ assetId: usdcEthereum.assetId, balanceRaw: '20000000' }),
        ]);
    });

    it('accepts implicit NEAR accounts and rejects cross-network assets', async () => {
        const requestBatch = jest.fn(async () => ({ providerAlias: 'near-primary', items: [] }));
        const service = new ChainBalanceService({ requestBatch } as unknown as ChainRpcService, config);
        await expect(
            service.getBalances(wallet('a'.repeat(64), 'near'), 'near:mainnet', [undefined]),
        ).resolves.toMatchObject({ balances: [] });
        await expect(
            service.getBalances(wallet('0x1111111111111111111111111111111111111111', 'ethereum'), 'eip155:8453', [
                usdcEthereum,
            ]),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
