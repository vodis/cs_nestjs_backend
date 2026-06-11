import { AssetRegistryEntry } from '../../domain/models/asset-registry-entry';

export const ASSET_REGISTRY_PORT = Symbol('ASSET_REGISTRY_PORT');

export interface AssetRegistryPort {
    findById(assetId: string): Promise<AssetRegistryEntry | undefined>;
}
