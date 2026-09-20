export type SwapAuthMethod = 'evm' | 'near';

export type SwapType = 'EXACT_INPUT' | 'EXACT_OUTPUT';

export type SwapAccountType = 'ORIGIN_CHAIN' | 'INTENTS';

export type SwapQuoteCommand = {
    originAsset: string;
    destinationAsset: string;
    amount: string;
    swapType: SwapType;
    slippageTolerance: number;
    deadline: string;
    signerId: string;
    recipient: string;
    recipientType: 'DESTINATION_CHAIN' | 'INTENTS';
    depositType: SwapAccountType;
    refundType: SwapAccountType;
    authMethod: SwapAuthMethod;
    minDeadlineMs?: number;
};
