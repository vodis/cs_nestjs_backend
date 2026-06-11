import { Injectable } from '@nestjs/common';
import { AssetsService } from '../../../../api/assets/assets.service';
import { AssetRegistryEntry } from '../../domain/models/asset-registry-entry';
import { AssetRegistryPort } from '../../application/ports/asset-registry.port';

@Injectable()
export class AssetRegistryAdapter implements AssetRegistryPort {
    constructor(private readonly assetsService: AssetsService) {}

    async findById(assetId: string): Promise<AssetRegistryEntry | undefined> {
        const asset = await this.assetsService.findAssetById(assetId);

        if (!asset) {
            return undefined;
        }

        return {
            assetId: asset.assetId,
            defuseAssetId: asset.defuseAssetId,
            symbol: asset.symbol,
            decimals: asset.decimals,
            blockchain: asset.blockchain,
            price: asset.price,
        };
    }
}
