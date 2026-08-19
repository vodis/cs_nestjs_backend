import { Injectable } from '@nestjs/common';
import { AssetsService } from '../../../api/assets/assets.service';
import { PortfolioAssetSource } from '../application/portfolio.ports';

@Injectable()
export class AssetsPortfolioAdapter implements PortfolioAssetSource {
    constructor(private readonly assets: AssetsService) {}

    async getAssets() {
        const response = await this.assets.getAssets();
        return response.data.map((asset) => ({
            assetId: asset.assetId,
            priceUsd: this.decimalPrice(asset.price),
            priceUpdatedAt: asset.priceUpdatedAt ?? null,
        }));
    }

    private decimalPrice(value: string | number | undefined): string | null {
        if (typeof value === 'string') return /^\d+(?:\.\d+)?$/.test(value) ? value : null;
        if (value === undefined || !Number.isFinite(value) || value < 0) return null;
        return value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 18 });
    }
}
