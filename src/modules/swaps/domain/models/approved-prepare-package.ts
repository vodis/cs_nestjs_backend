import { SwapAuthMethod } from './swap-quote-request';

export type SwapIntent = {
    intent: 'token_diff';
    diff: Record<string, string>;
};

export type SignatureStandard = 'erc191' | 'nep413';

export type ApprovedPreparePackage = {
    quoteHashes: string[];
    tokenDeltas: Record<string, string>;
    intents: SwapIntent[];
    signerId: string;
    deadline: string;
    authMethod: SwapAuthMethod;
    signatureStandard: SignatureStandard;
    originAsset: string;
    destinationAsset: string;
    amountIn: string;
    amountOut: string;
    slippageTolerance: number;
    quoteExpiration: string;
    providerId: string;
};
