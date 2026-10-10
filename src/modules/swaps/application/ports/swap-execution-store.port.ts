import type { SwapExecutionMode } from '../../domain/models/swap-quote';
import type { OneClickTerminalStatus } from '../../domain/models/swap-settlement-status';

export const SWAP_EXECUTION_STORE = Symbol('SWAP_EXECUTION_STORE');

export type StoredSwapPreparation = {
    userId?: string;
    historyData?: import('../../domain/models/swap-history').SwapHistoryDetails;

    id: string;
    providerId: string;
    executionMode: SwapExecutionMode;
    userAddress: string;
    userChainType: 'evm' | 'near' | 'ton';
    executionPayload: Record<string, unknown>;
    expiresAt: Date;
    settlementStatus?: OneClickTerminalStatus | null;
};

export type SwapExecutionClaim =
    | { state: 'claimed'; executionId: string }
    | { state: 'succeeded'; executionId: string; intentHash: string }
    | { state: 'pending' | 'failed' | 'conflict'; executionId: string };

export interface SwapExecutionStorePort {
    createPreparation(input: Omit<StoredSwapPreparation, 'id'>): Promise<StoredSwapPreparation>;
    findPreparation(id: string): Promise<StoredSwapPreparation | undefined>;
    recordTerminalSettlement(
        preparationId: string,
        status: OneClickTerminalStatus,
        receipt?: import('../../domain/models/swap-history').SwapReceipt,
    ): Promise<OneClickTerminalStatus>;
    claimExecution(input: {
        preparationId: string;
        userId: string;
        idempotencyKey: string;
        requestFingerprint: string;
        providerId: string;
        traceId: string;
    }): Promise<SwapExecutionClaim>;
    markSucceeded(executionId: string, intentHash: string): Promise<void>;
    markFailed(executionId: string, failureCode: string): Promise<void>;
}
