import { BadRequestException, Injectable } from '@nestjs/common';
import { isISO8601, isUUID } from 'class-validator';
import { SwapAttemptState, SwapHistoryCursor, SwapHistoryPort } from '../ports/swap-history.port';

@Injectable()
export class ListSwapHistoryUseCase {
    constructor(private readonly history: SwapHistoryPort) {}

    execute(userId: string, before?: unknown) {
        let cursor: SwapHistoryCursor | undefined;
        if (before !== undefined) {
            if (typeof before !== 'string') throw new BadRequestException('Invalid history cursor');
            const [timestamp, id, extra] = before.split('|');
            if (
                !timestamp ||
                !isISO8601(timestamp, { strict: true }) ||
                !Number.isFinite(Date.parse(timestamp)) ||
                !id ||
                !isUUID(id) ||
                extra !== undefined
            )
                throw new BadRequestException('Invalid history cursor');
            cursor = { createdAt: new Date(timestamp), id };
        }
        return this.history.list(userId, cursor);
    }
}

@Injectable()
export class RecordSwapAttemptUseCase {
    constructor(private readonly history: SwapHistoryPort) {}

    execute(userId: string, preparationId: string, state?: SwapAttemptState) {
        return this.history.startAttempt(userId, preparationId, state);
    }
}
