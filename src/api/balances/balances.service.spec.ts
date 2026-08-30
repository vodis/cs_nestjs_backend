import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { AssetsService } from '../assets/assets.service';
import { AssetDto } from '../assets/dto/get-assets-response.dto';
import { AppUser } from '../../database/models/app-user.model';
import { BalanceCacheEntry } from '../../database/models/balance-cache-entry.model';
import { WalletLink } from '../../database/models/wallet-link.model';
import { BalancesService } from './balances.service';
import { ChainBalanceService } from './chain-balance.service';
import { NEAR_NATIVE_ASSET_ID, NEAR_NATIVE_DECIMALS, NEAR_NATIVE_SYMBOL } from './near-balance.constants';

const usdc: AssetDto = {
    assetId: 'nep141:usdc.near',
    defuseAssetId: 'nep141:usdc.near',
    symbol: 'USDC',
    decimals: 6,
    blockchain: 'near',
};
const wrappedNear: AssetDto = {
    assetId: 'nep141:wrap.near',
    defuseAssetId: 'nep141:wrap.near',
    symbol: 'wNEAR',
    decimals: 24,
    blockchain: 'near',
};

function assetsService(): jest.Mocked<Pick<AssetsService, 'findAssetById'>> {
    return {
        findAssetById: jest.fn(async (assetId: string) =>
            [usdc, wrappedNear].find((asset) => asset.assetId === assetId),
        ),
    };
}

function chainBalanceService(): jest.Mocked<Pick<ChainBalanceService, 'getBalances'>> {
    return {
        getBalances: jest.fn(async (_wallet, network, assets) => ({
            balances: assets.map((asset) => ({
                network,
                assetId: asset?.assetId || NEAR_NATIVE_ASSET_ID,
                symbol: asset?.symbol || NEAR_NATIVE_SYMBOL,
                decimals: asset?.decimals ?? NEAR_NATIVE_DECIMALS,
                balanceRaw: asset?.assetId === usdc.assetId ? '1250000' : '1250000000000000000000000',
                balanceDecimal: '1.25',
                source: 'near_rpc' as const,
                providerAlias: 'near-primary',
                fetchedAt: new Date('2026-08-30T12:00:00.000Z'),
                expiresAt: new Date('2026-08-30T12:00:15.000Z'),
            })),
            failures: [],
        })),
    };
}

describe('BalancesService', () => {
    let sequelize: Sequelize;
    let service: BalancesService;
    let assets: jest.Mocked<Pick<AssetsService, 'findAssetById'>>;
    let chainBalances: jest.Mocked<Pick<ChainBalanceService, 'getBalances'>>;

    beforeEach(async () => {
        sequelize = new Sequelize({
            dialect: 'sqlite',
            storage: ':memory:',
            logging: false,
            models: [AppUser, WalletLink, BalanceCacheEntry],
        });
        await sequelize.sync({ force: true });
        assets = assetsService();
        chainBalances = chainBalanceService();
        service = new BalancesService(
            assets as unknown as AssetsService,
            chainBalances as unknown as ChainBalanceService,
        );
    });

    afterEach(async () => sequelize.close());

    async function userWallet(privyUserId = 'did:privy:user-1') {
        const user = await AppUser.create({ privyUserId, status: 'active' });
        const wallet = await WalletLink.create({
            userId: user.id,
            privyWalletId: `wallet-${privyUserId}`,
            address: 'alice.near',
            chainType: 'near',
            walletType: 'embedded',
            source: 'privy',
            status: 'active',
            isPrimary: true,
        });
        return { user, wallet };
    }

    async function cache(userId: string, wallet: WalletLink, asset: AssetDto, expiresAt: Date) {
        return BalanceCacheEntry.create({
            userId,
            walletId: wallet.id,
            walletAddress: wallet.address,
            chainType: wallet.chainType,
            network: 'near:mainnet',
            assetId: asset.assetId,
            symbol: asset.symbol,
            decimals: asset.decimals,
            balanceRaw: '1250000',
            balanceDecimal: '1.25',
            source: 'near_rpc',
            fetchedAt: new Date(Date.now() - 1000),
            expiresAt,
        });
    }

    it('batches allowlisted asset reads for an owned wallet and persists the network', async () => {
        const { user, wallet } = await userWallet();
        const result = await service.getBalances(
            { id: user.id, privyUserId: user.privyUserId, sessionId: 'session-1', passkeyEnabled: false },
            { walletAddress: wallet.address, network: 'near:mainnet', assetIds: [usdc.assetId, wrappedNear.assetId] },
        );

        expect(chainBalances.getBalances).toHaveBeenCalledWith(
            expect.objectContaining({ id: wallet.id, address: wallet.address }),
            'near:mainnet',
            [usdc, wrappedNear],
        );
        expect(result.data).toEqual([
            expect.objectContaining({ assetId: usdc.assetId, network: 'near:mainnet', stale: false }),
            expect.objectContaining({ assetId: wrappedNear.assetId, network: 'near:mainnet', stale: false }),
        ]);
        expect(result.meta).toMatchObject({ source: 'rpc', cached: false, partial: false });
        expect(await BalanceCacheEntry.count({ where: { network: 'near:mainnet' } })).toBe(2);
    });

    it('returns a fresh cache entry without calling RPC', async () => {
        const { user, wallet } = await userWallet();
        await cache(user.id, wallet, usdc, new Date(Date.now() + 60000));

        const result = await service.getBalances(
            { id: user.id, privyUserId: user.privyUserId, sessionId: 'session-1', passkeyEnabled: false },
            { walletId: wallet.id, network: 'near:mainnet', assetId: usdc.assetId },
        );

        expect(result.data).toEqual([expect.objectContaining({ assetId: usdc.assetId, stale: false })]);
        expect(result.meta).toMatchObject({ source: 'postgres_cache', cached: true, partial: false });
        expect(chainBalances.getBalances).not.toHaveBeenCalled();
    });

    it('returns an explicitly stale cache entry when every provider fails', async () => {
        const { user, wallet } = await userWallet();
        await cache(user.id, wallet, usdc, new Date(Date.now() - 60000));
        chainBalances.getBalances.mockRejectedValueOnce(new Error('RPC unavailable'));

        const result = await service.getBalances(
            { id: user.id, privyUserId: user.privyUserId, sessionId: 'session-1', passkeyEnabled: false },
            { walletId: wallet.id, network: 'near:mainnet', assetId: usdc.assetId },
        );

        expect(result.data).toEqual([expect.objectContaining({ assetId: usdc.assetId, stale: true })]);
        expect(result.meta).toMatchObject({ source: 'postgres_cache', cached: true, partial: true });
    });

    it('returns successful batch items and marks deterministic token failures as partial', async () => {
        const { user, wallet } = await userWallet();
        chainBalances.getBalances.mockResolvedValueOnce({
            balances: [
                {
                    network: 'near:mainnet',
                    assetId: usdc.assetId,
                    symbol: usdc.symbol,
                    decimals: usdc.decimals,
                    balanceRaw: '1250000',
                    balanceDecimal: '1.25',
                    source: 'near_rpc',
                    providerAlias: 'near-secondary',
                    fetchedAt: new Date(),
                    expiresAt: new Date(Date.now() + 15000),
                },
            ],
            failures: [{ assetId: wrappedNear.assetId, reason: 'contract unavailable' }],
        });

        const result = await service.getBalances(
            { id: user.id, privyUserId: user.privyUserId, sessionId: 'session-1', passkeyEnabled: false },
            { walletId: wallet.id, network: 'near:mainnet', assetIds: [usdc.assetId, wrappedNear.assetId] },
        );

        expect(result.data).toEqual([expect.objectContaining({ assetId: usdc.assetId })]);
        expect(result.meta.partial).toBe(true);
    });

    it('does not allow an authenticated user to read another user wallet', async () => {
        const { user } = await userWallet();
        const { wallet: otherWallet } = await userWallet('did:privy:user-2');
        await expect(
            service.getBalances(
                { id: user.id, privyUserId: user.privyUserId, sessionId: 'session-1', passkeyEnabled: false },
                { walletId: otherWallet.id, network: 'near:mainnet' },
            ),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects unsupported or ambiguous asset filters', async () => {
        const { user, wallet } = await userWallet();
        const authenticated = {
            id: user.id,
            privyUserId: user.privyUserId,
            sessionId: 'session-1',
            passkeyEnabled: false,
        };
        await expect(
            service.getBalances(authenticated, { walletId: wallet.id, assetIds: ['unsupported'] }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            service.getBalances(authenticated, {
                walletId: wallet.id,
                assetId: usdc.assetId,
                assetIds: [wrappedNear.assetId],
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
