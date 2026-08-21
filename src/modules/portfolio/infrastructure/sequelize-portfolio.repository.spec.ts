import { Op } from 'sequelize';
import { BalanceCacheEntry } from '../../../database/models/balance-cache-entry.model';
import { WalletLink } from '../../../database/models/wallet-link.model';
import { SequelizePortfolioRepository } from './sequelize-portfolio.repository';

describe('SequelizePortfolioRepository', () => {
    afterEach(() => jest.restoreAllMocks());

    it('excludes expired cache entries from agent portfolio snapshots', async () => {
        jest.spyOn(WalletLink, 'findAll').mockResolvedValue([{ id: 'wallet-1' }] as never);
        const balances = jest.spyOn(BalanceCacheEntry, 'findAll').mockResolvedValue([]);

        await new SequelizePortfolioRepository().balancesForUser('user-1');

        const options = balances.mock.calls[0][0] as { where: Record<string | symbol, unknown> };
        const expiresAt = options.where.expiresAt as Record<symbol, unknown>;
        expect(expiresAt[Op.gt]).toBeInstanceOf(Date);
    });
});
