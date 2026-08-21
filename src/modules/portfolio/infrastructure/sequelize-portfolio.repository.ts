import { Injectable } from '@nestjs/common';
import { Op } from 'sequelize';
import { BalanceCacheEntry } from '../../../database/models/balance-cache-entry.model';
import { InvestmentProfile } from '../../../database/models/investment-profile.model';
import { WalletLink } from '../../../database/models/wallet-link.model';
import { formatTokenAmount } from '../../../utils/decimal.util';
import { PortfolioRepository } from '../application/portfolio.ports';
import { InvestmentPreferences } from '../application/portfolio.types';

@Injectable()
export class SequelizePortfolioRepository implements PortfolioRepository {
    async balancesForUser(userId: string) {
        const wallets = await WalletLink.findAll({ where: { userId, status: 'active' }, attributes: ['id'] });
        if (!wallets.length) return [];
        const entries = await BalanceCacheEntry.findAll({
            where: {
                userId,
                walletId: { [Op.in]: wallets.map((wallet) => wallet.id) },
                expiresAt: { [Op.gt]: new Date() },
            },
            order: [['fetchedAt', 'DESC']],
        });
        return entries.map((entry) => ({
            walletId: entry.walletId,
            chain: entry.chainType,
            assetId: entry.assetId,
            symbol: entry.symbol,
            quantity: entry.balanceDecimal || formatTokenAmount(entry.balanceRaw, entry.decimals),
            balanceUpdatedAt: entry.fetchedAt,
        }));
    }

    async getPreferences(userId: string) {
        const profile = await InvestmentProfile.findOne({ where: { userId } });
        return profile ? this.serialize(profile) : null;
    }

    async savePreferences(userId: string, input: InvestmentPreferences) {
        const [profile] = await InvestmentProfile.upsert({ userId, ...input }, { returning: true });
        return this.serialize(profile);
    }

    private serialize(profile: InvestmentProfile) {
        return {
            objective: profile.objective,
            riskTolerance: profile.riskTolerance,
            horizon: profile.horizon,
            updatedAt: profile.updatedAt,
        };
    }
}
