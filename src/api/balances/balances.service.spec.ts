import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { AssetsService } from '../assets/assets.service';
import { AssetDto } from '../assets/dto/get-assets-response.dto';
import { AppUser } from '../../database/models/app-user.model';
import { BalanceCacheEntry } from '../../database/models/balance-cache-entry.model';
import { WalletLink } from '../../database/models/wallet-link.model';
import { BalancesService } from './balances.service';

const asset: AssetDto = {
    assetId: 'nep141:usdc.near',
    defuseAssetId: 'nep141:usdc.near',
    symbol: 'USDC',
    decimals: 6,
    blockchain: 'near',
};

function assetsService(): jest.Mocked<Pick<AssetsService, 'findAssetById'>> {
    return {
        findAssetById: jest.fn(async (assetId: string) => (assetId === asset.assetId ? asset : undefined)),
    };
}

describe('BalancesService', () => {
    let sequelize: Sequelize;
    let service: BalancesService;
    let assets: jest.Mocked<Pick<AssetsService, 'findAssetById'>>;

    beforeEach(async () => {
        sequelize = new Sequelize({
            dialect: 'sqlite',
            storage: ':memory:',
            logging: false,
            models: [AppUser, WalletLink, BalanceCacheEntry],
        });
        await sequelize.sync({ force: true });

        assets = assetsService();
        service = new BalancesService(assets as unknown as AssetsService);
    });

    afterEach(async () => {
        await sequelize.close();
    });

    it('returns valid cached balances for active wallets owned by the authenticated user', async () => {
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
