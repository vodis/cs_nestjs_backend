import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { AssetsService } from '../assets/assets.service';
import { AssetDto } from '../assets/dto/get-assets-response.dto';
import { AppUser } from '../../database/models/app-user.model';
import { BalanceCacheEntry } from '../../database/models/balance-cache-entry.model';
import { WalletLink } from '../../database/models/wallet-link.model';
import { BalancesService } from './balances.service';
import { NearRpcBalanceService } from './near-rpc-balance.service';
import {
    NEAR_BALANCE_SOURCE,
    NEAR_NATIVE_ASSET_ID,
    NEAR_NATIVE_DECIMALS,
    NEAR_NATIVE_SYMBOL,
} from './near-balance.constants';

const asset: AssetDto = {
    assetId: 'nep141:usdc.near',
    defuseAssetId: 'nep141:usdc.near',
    symbol: 'USDC',
    decimals: 6,
    blockchain: 'near',
};
const nearAsset: AssetDto = {
    assetId: 'nep141:wrap.near',
    defuseAssetId: 'nep141:wrap.near',
    symbol: 'NEAR',
    decimals: 24,
    blockchain: 'near',
};

function assetsService(): jest.Mocked<Pick<AssetsService, 'findAssetById'>> {
    return {
        findAssetById: jest.fn(async (assetId: string) => {
            if (assetId === asset.assetId) {
                return asset;
            }
            if (assetId === nearAsset.assetId) {
                return nearAsset;
            }
            return undefined;
        }),
    };
}

function nearRpcBalanceService(): jest.Mocked<Pick<NearRpcBalanceService, 'getNativeBalance'>> {
    return {
        getNativeBalance: jest.fn(async (accountId: string) => {
            void accountId;

            return {
                assetId: NEAR_NATIVE_ASSET_ID,
                symbol: NEAR_NATIVE_SYMBOL,
                decimals: NEAR_NATIVE_DECIMALS,
                balanceRaw: '1250000000000000000000000',
                balanceDecimal: '1.25',
                fetchedAt: new Date('2026-08-12T12:00:00.000Z'),
                expiresAt: new Date('2026-08-12T12:00:15.000Z'),
            };
        }),
    };
}

describe('BalancesService', () => {
    let sequelize: Sequelize;
    let service: BalancesService;
    let assets: jest.Mocked<Pick<AssetsService, 'findAssetById'>>;
    let nearRpc: jest.Mocked<Pick<NearRpcBalanceService, 'getNativeBalance'>>;

    beforeEach(async () => {
        sequelize = new Sequelize({
            dialect: 'sqlite',
            storage: ':memory:',
            logging: false,
            models: [AppUser, WalletLink, BalanceCacheEntry],
        });
        await sequelize.sync({ force: true });

        assets = assetsService();
        nearRpc = nearRpcBalanceService();
        service = new BalancesService(assets as unknown as AssetsService, nearRpc as unknown as NearRpcBalanceService);
    });

    afterEach(async () => {
        await sequelize.close();
    });

    it('returns valid cached balances for active wallets owned by the authenticated user', async () => {
        const user = await AppUser.create({ privyUserId: 'did:privy:user-1', status: 'active' });
        const wallet = await WalletLink.create({
            userId: user.id,
            privyWalletId: 'wallet-1',
            address: 'alice.near',
            chainType: 'near',
            walletType: 'embedded',
            source: 'privy',
            status: 'active',
            isPrimary: true,
        });
        await BalanceCacheEntry.create({
            userId: user.id,
            walletId: wallet.id,
            walletAddress: wallet.address,
            chainType: wallet.chainType,
            assetId: asset.assetId,
            symbol: asset.symbol,
            decimals: asset.decimals,
            balanceRaw: '1250000',
            balanceDecimal: '1.25',
            source: 'near_rpc',
            fetchedAt: new Date(Date.now() - 1000),
            expiresAt: new Date(Date.now() + 60000),
        });

        const result = await service.getBalances(
            { id: user.id, privyUserId: user.privyUserId, sessionId: 'session-1', passkeyEnabled: false },
            {},
        );

        expect(result.data).toEqual([
            {
                walletId: wallet.id,
                walletAddress: wallet.address,
                chainType: 'near',
                assetId: NEAR_NATIVE_ASSET_ID,
                symbol: NEAR_NATIVE_SYMBOL,
                decimals: NEAR_NATIVE_DECIMALS,
                balanceRaw: '1250000000000000000000000',
                balanceDecimal: '1.25',
                source: NEAR_BALANCE_SOURCE,
                fetchedAt: '2026-08-12T12:00:00.000Z',
                expiresAt: '2026-08-12T12:00:15.000Z',
            },
            {
                walletId: wallet.id,
                walletAddress: wallet.address,
                chainType: 'near',
                assetId: asset.assetId,
                symbol: 'USDC',
                decimals: 6,
                balanceRaw: '1250000',
                balanceDecimal: '1.25',
                source: 'near_rpc',
                fetchedAt: expect.any(String),
                expiresAt: expect.any(String),
            },
        ]);
        expect(result.meta.source).toBe('mixed');
        expect(result.meta.cached).toBe(false);
    });

    it('returns valid cached native NEAR without calling RPC', async () => {
        const user = await AppUser.create({ privyUserId: 'did:privy:user-1', status: 'active' });
        const wallet = await WalletLink.create({
            userId: user.id,
            privyWalletId: 'wallet-1',
            address: 'alice.near',
            chainType: 'near',
            walletType: 'embedded',
            source: 'privy',
            status: 'active',
            isPrimary: true,
        });
        await BalanceCacheEntry.create({
            userId: user.id,
            walletId: wallet.id,
            walletAddress: wallet.address,
            chainType: wallet.chainType,
            assetId: NEAR_NATIVE_ASSET_ID,
            symbol: NEAR_NATIVE_SYMBOL,
            decimals: NEAR_NATIVE_DECIMALS,
            balanceRaw: '2000000000000000000000000',
            balanceDecimal: '2',
            source: 'postgres_cache',
            fetchedAt: new Date(Date.now() - 1000),
            expiresAt: new Date(Date.now() + 60000),
        });

        const result = await service.getBalances(
            { id: user.id, privyUserId: user.privyUserId, sessionId: 'session-1', passkeyEnabled: false },
            { walletAddress: wallet.address, network: 'near:mainnet' },
        );

        expect(result.data).toEqual([
            expect.objectContaining({
                walletId: wallet.id,
                walletAddress: wallet.address,
                assetId: NEAR_NATIVE_ASSET_ID,
                balanceRaw: '2000000000000000000000000',
                balanceDecimal: '2',
            }),
        ]);
        expect(result.meta.source).toBe('postgres_cache');
        expect(result.meta.cached).toBe(true);
        expect(nearRpc.getNativeBalance).not.toHaveBeenCalled();
    });

    it('returns live native NEAR balance for wallet address and network body filters', async () => {
        const user = await AppUser.create({ privyUserId: 'did:privy:user-1', status: 'active' });
        const wallet = await WalletLink.create({
            userId: user.id,
            privyWalletId: 'wallet-1',
            address: 'alice.near',
            chainType: 'near',
            walletType: 'embedded',
            source: 'privy',
            status: 'active',
            isPrimary: true,
        });

        const result = await service.getBalances(
            { id: user.id, privyUserId: user.privyUserId, sessionId: 'session-1', passkeyEnabled: false },
            { walletAddress: wallet.address, network: 'near:mainnet', assetId: nearAsset.assetId },
        );

        expect(result.data).toEqual([
            expect.objectContaining({
                walletId: wallet.id,
                assetId: NEAR_NATIVE_ASSET_ID,
                symbol: NEAR_NATIVE_SYMBOL,
                balanceRaw: '1250000000000000000000000',
            }),
        ]);
        expect(nearRpc.getNativeBalance).toHaveBeenCalledWith('alice.near');
    });

    it('returns cached balances when native NEAR live refresh fails', async () => {
        const user = await AppUser.create({ privyUserId: 'did:privy:user-1', status: 'active' });
        const wallet = await WalletLink.create({
            userId: user.id,
            privyWalletId: 'wallet-1',
            address: 'alice.near',
            chainType: 'near',
            walletType: 'embedded',
            source: 'privy',
            status: 'active',
            isPrimary: true,
        });
        await BalanceCacheEntry.create({
            userId: user.id,
            walletId: wallet.id,
            walletAddress: wallet.address,
            chainType: wallet.chainType,
            assetId: asset.assetId,
            symbol: asset.symbol,
            decimals: asset.decimals,
            balanceRaw: '1250000',
            balanceDecimal: '1.25',
            source: NEAR_BALANCE_SOURCE,
            fetchedAt: new Date(Date.now() - 1000),
            expiresAt: new Date(Date.now() + 60000),
        });
        nearRpc.getNativeBalance.mockRejectedValueOnce(new Error('RPC unavailable'));

        const result = await service.getBalances(
            { id: user.id, privyUserId: user.privyUserId, sessionId: 'session-1', passkeyEnabled: false },
            {},
        );

        expect(result.data).toEqual([
            expect.objectContaining({
                walletId: wallet.id,
                assetId: asset.assetId,
                balanceRaw: '1250000',
            }),
        ]);
        expect(result.meta.source).toBe('postgres_cache');
        expect(result.meta.cached).toBe(true);
    });

    it('does not return expired cache entries', async () => {
        const user = await AppUser.create({ privyUserId: 'did:privy:user-1', status: 'active' });
        const wallet = await WalletLink.create({
            userId: user.id,
            privyWalletId: 'wallet-1',
            address: '0xa000000000000000000000000000000000000001',
            chainType: 'near',
            walletType: 'embedded',
            source: 'privy',
            status: 'active',
            isPrimary: true,
        });
        await BalanceCacheEntry.create({
            userId: user.id,
            walletId: wallet.id,
            walletAddress: wallet.address,
            chainType: wallet.chainType,
            assetId: asset.assetId,
            symbol: asset.symbol,
            decimals: asset.decimals,
            balanceRaw: '1250000',
            balanceDecimal: '1.25',
            fetchedAt: new Date(Date.now() - 120000),
            expiresAt: new Date(Date.now() - 60000),
        });

        const result = await service.getBalances(
            { id: user.id, privyUserId: user.privyUserId, sessionId: 'session-1', passkeyEnabled: false },
            {},
        );

        expect(result.data).toEqual([]);
    });

    it('rejects balances for wallets not owned by the authenticated user', async () => {
        const user = await AppUser.create({ privyUserId: 'did:privy:user-1', status: 'active' });
        const otherUser = await AppUser.create({ privyUserId: 'did:privy:user-2', status: 'active' });
        const otherWallet = await WalletLink.create({
            userId: otherUser.id,
            privyWalletId: 'wallet-2',
            address: '0xa000000000000000000000000000000000000002',
            chainType: 'near',
            walletType: 'embedded',
            source: 'privy',
            status: 'active',
            isPrimary: true,
        });

        await expect(
            service.getBalances(
                { id: user.id, privyUserId: user.privyUserId, sessionId: 'session-1', passkeyEnabled: false },
                { walletId: otherWallet.id },
            ),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects unsupported asset filters', async () => {
        const user = await AppUser.create({ privyUserId: 'did:privy:user-1', status: 'active' });

        await expect(
            service.getBalances(
                { id: user.id, privyUserId: user.privyUserId, sessionId: 'session-1', passkeyEnabled: false },
                { assetId: 'unsupported' },
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
