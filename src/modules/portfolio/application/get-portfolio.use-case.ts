import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { formatScaled, multiplyToScale, percentage } from '../domain/decimal-value';
import {
    PORTFOLIO_ASSET_SOURCE,
    PORTFOLIO_REPOSITORY,
    PortfolioAssetSource,
    PortfolioRepository,
} from './portfolio.ports';

@Injectable()
export class GetPortfolioUseCase {
    constructor(
        @Inject(PORTFOLIO_REPOSITORY) private readonly repository: PortfolioRepository,
        @Inject(PORTFOLIO_ASSET_SOURCE) private readonly assets: PortfolioAssetSource,
    ) {}

    async execute(userId: string) {
        const [balances, assets] = await Promise.all([
            this.repository.balancesForUser(userId),
            this.assets.getAssets(),
        ]);
        const assetById = new Map(assets.map((asset) => [asset.assetId, asset]));
        const calculated = balances.map((balance) => {
            const asset = assetById.get(balance.assetId);
            const value = asset?.priceUsd ? multiplyToScale(balance.quantity, asset.priceUsd) : null;
            return { balance, asset, value };
        });
        const total = calculated.reduce((sum, item) => sum + (item.value ?? 0n), 0n);
        const freshnessTimestamps = calculated.flatMap(({ balance, asset }) => {
            const timestamps = [balance.balanceUpdatedAt];
            if (asset?.priceUpdatedAt) {
                const priceUpdatedAt = new Date(asset.priceUpdatedAt);
                if (!Number.isNaN(priceUpdatedAt.getTime())) timestamps.push(priceUpdatedAt);
            }
            return timestamps;
        });
        const asOf = freshnessTimestamps.reduce<Date | null>(
            (oldest, timestamp) => (!oldest || timestamp < oldest ? timestamp : oldest),
            null,
        );

        return {
            asOf: asOf?.toISOString() ?? null,
            valuationCurrency: 'USD' as const,
            totalValue: formatScaled(total),
            unpricedPositionCount: calculated.filter((item) => item.value === null).length,
            positions: calculated.map(({ balance, asset, value }) => ({
                walletRef: createHash('sha256').update(`${userId}:${balance.walletId}`).digest('hex').slice(0, 16),
                chain: balance.chain,
                assetId: balance.assetId,
                symbol: balance.symbol,
                quantity: balance.quantity,
                priceUsd: asset?.priceUsd ?? null,
                valueUsd: value === null ? null : formatScaled(value),
                allocationPercent: value === null ? null : percentage(value, total),
                priceUpdatedAt: asset?.priceUpdatedAt ?? null,
                balanceUpdatedAt: balance.balanceUpdatedAt.toISOString(),
            })),
        };
    }
}
