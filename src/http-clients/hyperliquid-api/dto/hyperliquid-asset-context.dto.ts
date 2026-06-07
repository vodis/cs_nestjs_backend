export interface HyperliquidAssetContextDto {
    prevDayPx: string;
    dayNtlVlm: string;
    markPx: string;
    midPx?: string;
    funding: string;
    openInterest: string;
}

export interface HyperliquidMetaDto {
    universe: Array<{ name: string }>;
}
