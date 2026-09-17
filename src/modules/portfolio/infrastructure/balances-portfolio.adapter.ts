import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Op } from 'sequelize';
import { BalancesService } from '../../../api/balances/balances.service';
import { BalanceCacheEntry } from '../../../database/models/balance-cache-entry.model';
import { WalletLink } from '../../../database/models/wallet-link.model';
import { formatTokenAmount } from '../../../utils/decimal.util';
import { PortfolioBalanceSource } from '../application/portfolio.ports';
import { PortfolioBalanceQuery } from '../application/portfolio.types';

@Injectable()
export class BalancesPortfolioAdapter implements PortfolioBalanceSource {
    constructor(private readonly balances: BalancesService) {}

    async balancesForUser(userId: string, query?: PortfolioBalanceQuery) {
        if (query?.walletAddress || query?.network) {
            const response = await this.balances.getBalancesForUser(userId, query);
            if (response.meta.partial && response.data.length === 0) {
                throw new ServiceUnavailableException('Portfolio balance is temporarily unavailable');
            }
            return response.data.map((balance) => ({
                walletReference: balance.walletId || balance.walletAddress,
                chain: balance.network,
                assetId: balance.assetId,
                symbol: balance.symbol,
                quantity: balance.balanceDecimal || formatTokenAmount(balance.balanceRaw, balance.decimals),
                balanceUpdatedAt: new Date(balance.fetchedAt),
            }));
        }

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
            walletReference: entry.walletId,
            chain: entry.network,
            assetId: entry.assetId,
            symbol: entry.symbol,
            quantity: entry.balanceDecimal || formatTokenAmount(entry.balanceRaw, entry.decimals),
            balanceUpdatedAt: entry.fetchedAt,
        }));
    }
}
