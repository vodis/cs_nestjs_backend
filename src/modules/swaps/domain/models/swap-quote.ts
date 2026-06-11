export type SwapExecutionMode = 'intent_sign' | 'deposit_address';

export type SwapQuote = {
    providerId: string;
    executionMode: SwapExecutionMode;
    quoteHashes: string[];
    originAsset: string;
    destinationAsset: string;
    amountIn: string;
    amountOut: string;
    expirationTime: string;
    providerMeta?: Record<string, unknown>;
};
