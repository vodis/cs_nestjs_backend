import type { SwapHistoryDetails } from '../../domain/models/swap-history';
import type { OneClickSwapStatus } from '../../domain/models/swap-settlement-status';

export type SwapHistoryCursor = { createdAt: Date; id: string };
export type SwapAttemptState = NonNullable<SwapHistoryDetails['submissionState']>;
export type SwapHistoryPage = {
    items: (SwapHistoryDetails & {
        preparationId: string;
        createdAt: string;
        status: OneClickSwapStatus | SwapAttemptState | 'UNKNOWN';
    })[];
    nextCursor: string | null;
};
export abstract class SwapHistoryPort {
    abstract list(userId: string, before?: SwapHistoryCursor): Promise<SwapHistoryPage>;
    abstract startAttempt(userId: string, preparationId: string, state?: SwapAttemptState): Promise<void>;
}
