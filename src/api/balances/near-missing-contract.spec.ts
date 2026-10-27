import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Sequelize } from 'sequelize-typescript';
import { AssetsService } from '../assets/assets.service';
import { AppUser } from '../../database/models/app-user.model';
import { WalletLink } from '../../database/models/wallet-link.model';
import { BalanceCacheEntry } from '../../database/models/balance-cache-entry.model';
import { BalancesPortfolioAdapter } from '../../modules/portfolio/infrastructure/balances-portfolio.adapter';
import { BalancesService } from './balances.service';
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
        expect(result.failures).toEqual([{ assetId: 'near:native', reason: 'RPC provider rejected the request' }]);
    });

    it('does not convert a provider outage into zero', async () => {
        const { service, post } = setup(missingAccount());
        post.mockReset()
            .mockResolvedValueOnce(response({ result: { chain_id: 'mainnet' } }))
            .mockRejectedValueOnce(new Error('unavailable'));
        await expect(service.getBalances(wallet, 'near:mainnet', [token])).rejects.toThrow();
    });
});

describe('missing NEAR contract persistence', () => {
    it('replaces an expired positive balance with zero and reuses it in the portfolio', async () => {
        const sequelize = new Sequelize({
            dialect: 'sqlite',
            storage: ':memory:',
            logging: false,
            models: [AppUser, WalletLink, BalanceCacheEntry],
        });
        try {
            await sequelize.sync({ force: true });
            const { service, post } = setup(missingAccount());
            const module = await Test.createTestingModule({
                providers: [
                    BalancesService,
                    BalancesPortfolioAdapter,
                    { provide: ChainBalanceService, useValue: service },
                    { provide: AssetsService, useValue: { getAssets: async () => ({ data: [token] }) } },
                ],
            }).compile();
            const user = await AppUser.create({ privyUserId: 'did:privy:missing-contract', status: 'active' });
            const linked = await WalletLink.create({
                userId: user.id,
                privyWalletId: 'missing-contract-wallet',
                ...wallet,
                walletType: 'embedded',
                source: 'privy',
                status: 'active',
                isPrimary: true,
            });
            const stale = await BalanceCacheEntry.create({
                userId: user.id,
                walletId: linked.id,
                walletAddress: wallet.address,
                chainType: 'near',
                network: 'near:mainnet',
                assetId: token.assetId,
                symbol: token.symbol,
                decimals: token.decimals,
                balanceRaw: '1250000',
                balanceDecimal: '1.25',
                source: 'near_rpc',
                fetchedAt: new Date(Date.now() - 60000),
                expiresAt: new Date(Date.now() - 30000),
            });
            const portfolio = module.get(BalancesPortfolioAdapter);
            const query = { walletAddress: wallet.address, network: 'near:mainnet' };
            const holdings = await portfolio.balancesForUser(user.id, query);
            expect(holdings).toEqual([expect.objectContaining({ assetId: 'near:native', quantity: '2' })]);
            await stale.reload();
            expect(stale.balanceRaw).toBe('0');
            expect(stale.balanceDecimal).toBe('0');
            expect(stale.expiresAt.getTime()).toBeGreaterThan(Date.now());
            expect(await BalanceCacheEntry.count({ where: { assetId: token.assetId } })).toBe(1);
            const cached = await module.get(BalancesService).getBalancesForUser(user.id, {
                ...query,
                assetIds: [token.assetId],
            });
            expect(cached.meta.partial).toBe(false);
            expect(cached.data).toEqual([expect.objectContaining({ assetId: token.assetId, balanceRaw: '0' })]);
            expect(await portfolio.balancesForUser(user.id, query)).toEqual(holdings);
            expect(post).toHaveBeenCalledTimes(3);
            await module.close();
        } finally {
            jest.restoreAllMocks();
            await sequelize.close();
        }
    });
});
