import { Test } from '@nestjs/testing';
import { Sequelize } from 'sequelize-typescript';
import { AssetsService } from '../../../api/assets/assets.service';
import { BalancesService } from '../../../api/balances/balances.service';
import { ChainBalanceService } from '../../../api/balances/chain-balance.service';
import { AppUser } from '../../../database/models/app-user.model';
import { BalanceCacheEntry } from '../../../database/models/balance-cache-entry.model';
import { WalletLink } from '../../../database/models/wallet-link.model';
import { GetPortfolioUseCase } from '../application/get-portfolio.use-case';
import { BalancesPortfolioAdapter } from './balances-portfolio.adapter';

it('values cached NEAR tokens once across repeated live portfolio reads', async () => {
    const sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: ':memory:',
        logging: false,
        models: [AppUser, WalletLink, BalanceCacheEntry],
    });
    const token = {
        assetId: 'nep141:token.near',
        defuseAssetId: 'nep141:token.near',
        blockchain: 'near',
        symbol: 'TOK',
        decimals: 0,
    };
    const getBalances = jest.fn().mockRejectedValue(new Error('Unexpected RPC for fresh cache'));
    const module = await Test.createTestingModule({
        providers: [
            BalancesService,
            BalancesPortfolioAdapter,
            { provide: ChainBalanceService, useValue: { getBalances } },
            { provide: AssetsService, useValue: { getAssets: async () => ({ data: [token] }) } },
        ],
    }).compile();
    try {
        await sequelize.sync({ force: true });
        const user = await AppUser.create({ privyUserId: 'did:privy:portfolio-cache', status: 'active' });
        const wallet = await WalletLink.create({
            userId: user.id,
            privyWalletId: 'portfolio-cache-wallet',
            address: 'alice.near',
            chainType: 'near',
            walletType: 'embedded',
            source: 'privy',
            status: 'active',
            isPrimary: true,
        });
        const now = new Date();
        for (const [assetId, symbol, quantity] of [
            ['near:native', 'NEAR', '2'],
            [token.assetId, 'TOK', '10'],
        ]) {
            await BalanceCacheEntry.create({
                userId: user.id,
                walletId: wallet.id,
                walletAddress: wallet.address,
                chainType: 'near',
                network: 'near:mainnet',
                assetId,
                symbol,
                decimals: 0,
                balanceRaw: quantity,
                balanceDecimal: quantity,
                source: 'near_rpc',
                fetchedAt: now,
                expiresAt: new Date(now.getTime() + 60000),
            });
        }
        const portfolio = new GetPortfolioUseCase(module.get(BalancesPortfolioAdapter), {
            getAssets: async () =>
                ['near:native', token.assetId].map((assetId) => ({
                    assetId,
                    priceUsd: '1',
                    priceUpdatedAt: now.toISOString(),
                })),
        });
        for (let request = 0; request < 2; request++) {
            const snapshot = await portfolio.execute(user.id, {
                walletAddress: wallet.address,
                network: 'near:mainnet',
            });
            expect(snapshot.totalValue).toBe('12');
            expect(snapshot.positions).toHaveLength(2);
        }
        expect(getBalances).not.toHaveBeenCalled();
    } finally {
        await module.close();
        await sequelize.close();
    }
});
