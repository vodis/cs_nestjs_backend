export type AssetRegistryEntry = {
    assetId: string;
    defuseAssetId: string;
    symbol: string;
    decimals: number;
    blockchain: string;
    contractAddress?: string;
    sourceNetwork?: string;
    nativeFundingSourceAssetId?: string;
    price?: string | number;
};
