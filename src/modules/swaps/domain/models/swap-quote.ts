import type { SignatureStandard, SwapIntent } from './approved-prepare-package';

export type SwapExecutionMode = 'intent_sign' | 'deposit_address' | 'evm_transaction' | 'external_redirect';
export type SwapRequiredAction = 'sign' | 'deposit' | 'submit_transaction' | 'redirect';

export type SwapExecutionPackage = {
    providerId: string;
    mode: SwapExecutionMode;
    protocol: string;
    requiredAction: SwapRequiredAction;
    payload: Record<string, unknown>;
};

export type NearIntentsExecutionPayload = {
    quoteHashes: string[];
    tokenDeltas: Record<string, string>;
    intents: SwapIntent[];
    signerId: string;
    deadline: string;
    deadlineTimestamp: number;
    signatureStandard: SignatureStandard;
};

export type SwapQuote = {
    providerId: string;
    executionMode: SwapExecutionMode;
    quoteHashes: string[];
    originAsset: string;
    destinationAsset: string;
    amountIn: string;
    amountOut: string;
    expirationTime: string;
    executionPackage?: SwapExecutionPackage;
    providerMeta?: Record<string, unknown>;
};
