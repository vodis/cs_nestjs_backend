export type SwapAuthMethod = 'evm' | 'near' | 'ton';

export type SwapType = 'EXACT_INPUT' | 'EXACT_OUTPUT';

export type SwapAccountType = 'ORIGIN_CHAIN' | 'INTENTS' | 'CONFIDENTIAL_INTENTS';

export type SwapQuoteCommand = {
    providerId?: 'one-click' | 'solver-relay';
    sourceAssetId?: string;
    network?: string;
    originAsset: string;
    destinationAsset: string;
    amount: string;
    swapType: SwapType;
    slippageTolerance: number;
    deadline: string;
    signerId: string;
    recipient: string;
    recipientType: 'DESTINATION_CHAIN' | 'INTENTS' | 'CONFIDENTIAL_INTENTS';
    depositType?: SwapAccountType;
    refundType?: SwapAccountType;
    authMethod: SwapAuthMethod;
    minDeadlineMs?: number;
};
