import { SwapExecutionMode } from '../../domain/models/swap-quote';

export const EXECUTION_PROVIDERS = Symbol('EXECUTION_PROVIDERS');

export type ExecuteSwapCommand = {
    providerId: string;
    executionMode?: SwapExecutionMode;
    executionPayload?: Record<string, unknown>;
    signature?: Record<string, unknown>;
    quoteHashes?: string[];
    userAddress: string;
    userChainType: 'evm' | 'near';
    traceId: string;
};

export type ExecuteSwapResult = {
    intentHash: string;
};

export interface ExecutionProviderPort {
    readonly providerId: string;

    execute(command: ExecuteSwapCommand): Promise<ExecuteSwapResult>;
}
