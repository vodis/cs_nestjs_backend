import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Op } from 'sequelize';
import { BalancesService } from '../../../api/balances/balances.service';
import { AssetsService } from '../../../api/assets/assets.service';
import { nearTokenContractFromAssetId } from '../../../api/balances/near-balance.constants';
import { BalanceCacheEntry } from '../../../database/models/balance-cache-entry.model';
import { WalletLink } from '../../../database/models/wallet-link.model';
import { formatTokenAmount } from '../../../utils/decimal.util';
import { PortfolioBalanceSource } from '../application/portfolio.ports';
import { PortfolioBalanceQuery } from '../application/portfolio.types';

@Injectable()
export class BalancesPortfolioAdapter implements PortfolioBalanceSource {
    constructor(
        private readonly balances: BalancesService,
        private readonly assets: AssetsService,
    ) {}

    async balancesForUser(userId: string, query?: PortfolioBalanceQuery) {
        if (query?.walletAddress || query?.network) {
            const responses = await this.liveBalanceResponses(userId, query);
            if (responses.some((response) => response.meta.partial)) {
                throw new ServiceUnavailableException('Portfolio balance is temporarily unavailable');
            }
            return responses.flatMap((response) =>
                response.data
                    .filter((balance) => !/^0+$/.test(balance.balanceRaw))
                    .map((balance) => ({
                        walletReference: balance.walletId || balance.walletAddress,
                        chain: balance.network,
                        assetId: balance.assetId,
                        symbol: balance.symbol,
                        quantity: balance.balanceDecimal || formatTokenAmount(balance.balanceRaw, balance.decimals),
                        balanceUpdatedAt: new Date(balance.fetchedAt),
                    })),
            );
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

    private async liveBalanceResponses(userId: string, query: PortfolioBalanceQuery) {
        const nativeResponse = await this.balances.getBalancesForUser(userId, query);
        const tokenResponses: Array<Awaited<ReturnType<BalancesService['getBalancesForUser']>>> = [];
        const resolvedNetwork = nativeResponse.data[0]?.network || query.network;
        if (resolvedNetwork === 'near:mainnet') {
            const { data } = await this.assets.getAssets();
            const assetIds = data
                .filter(
                    (asset) => asset.blockchain.toLowerCase() === 'near' && nearTokenContractFromAssetId(asset.assetId),
                )
                .map((asset) => asset.assetId);
            for (let index = 0; index < assetIds.length; index += 20) {
                tokenResponses.push(
                    await this.balances.getBalancesForUser(userId, {
                        ...query,
                        network: resolvedNetwork,
                        assetIds: assetIds.slice(index, index + 20),
                    }),
                );
            }
        }
        return [nativeResponse, ...tokenResponses];
    }
}
