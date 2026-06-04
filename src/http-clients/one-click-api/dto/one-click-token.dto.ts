export interface OneClickTokenDto {
    assetId: string;
    decimals: number;
    blockchain: string;
    symbol: string;
    price?: string | number;
    priceUpdatedAt?: string;
    contractAddress?: string;
}
