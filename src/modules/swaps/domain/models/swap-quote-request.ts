export type SwapAuthMethod = 'evm' | 'near';

export type SwapType = 'EXACT_INPUT' | 'EXACT_OUTPUT';

export type SwapQuoteCommand = {
    originAsset: string;
    destinationAsset: string;
    amount: string;
    swapType: SwapType;
    slippageTolerance: number;
    deadline: string;
    signerId: string;
    authMethod: SwapAuthMethod;
    minDeadlineMs?: number;
};
