import { Inject, Injectable } from '@nestjs/common';
import { Transaction, UniqueConstraintError } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { SEQUELIZE } from '../../../../database/database.tokens';
import { ProductEvent } from '../../../../database/models/product-event.model';
import { SwapExecution } from '../../../../database/models/swap-execution.model';
import { SwapPreparation } from '../../../../database/models/swap-preparation.model';
import {
    StoredSwapPreparation,
    SwapExecutionClaim,
    SwapExecutionStorePort,
} from '../../application/ports/swap-execution-store.port';

@Injectable()
export class SequelizeSwapExecutionStore implements SwapExecutionStorePort {
    constructor(@Inject(SEQUELIZE) private readonly sequelize: Sequelize) {}

    async createPreparation(input: Omit<StoredSwapPreparation, 'id'>): Promise<StoredSwapPreparation> {
        const row = await SwapPreparation.create(input);
        return this.toPreparation(row);
    }

    async findPreparation(id: string): Promise<StoredSwapPreparation | undefined> {
        const row = await SwapPreparation.findByPk(id);
        return row ? this.toPreparation(row) : undefined;
    }

    async claimExecution(input: {
        preparationId: string;
        userId: string;
        idempotencyKey: string;
        requestFingerprint: string;
        providerId: string;
        traceId: string;
    }): Promise<SwapExecutionClaim> {
        try {
            return await this.sequelize.transaction(async (transaction) => {
                const row = await SwapExecution.create({ ...input, status: 'pending' }, { transaction });
                await this.recordEvent(row, 'attempted', undefined, transaction);
                return { state: 'claimed', executionId: row.id };
            });
        } catch (error) {
            if (!(error instanceof UniqueConstraintError)) {
                throw error;
            }
        }

        const byIdempotencyKey = await SwapExecution.findOne({
            where: { userId: input.userId, idempotencyKey: input.idempotencyKey },
        });
        if (byIdempotencyKey && byIdempotencyKey.requestFingerprint !== input.requestFingerprint) {
            return { state: 'conflict', executionId: byIdempotencyKey.id };
        }
        const existing =
            byIdempotencyKey ??
            (await SwapExecution.findOne({
                where: { userId: input.userId, requestFingerprint: input.requestFingerprint },
            }));
        if (!existing) {
            throw new Error('Swap execution uniqueness conflict could not be resolved');
        }
        if (existing.status === 'succeeded' && existing.intentHash) {
            return { state: 'succeeded', executionId: existing.id, intentHash: existing.intentHash };
        }
        if (existing.status === 'succeeded') {
            throw new Error(`Succeeded swap execution ${existing.id} has no intent hash`);
        }
        return { state: existing.status, executionId: existing.id };
    }

    async markSucceeded(executionId: string, intentHash: string): Promise<void> {
        await this.sequelize.transaction(async (transaction) => {
            const row = await this.pendingExecution(executionId, transaction);
            await row.update({ status: 'succeeded', intentHash, failureCode: null }, { transaction });
            await this.recordEvent(row, 'succeeded', undefined, transaction);
        });
    }

    async markFailed(executionId: string, failureCode: string): Promise<void> {
        await this.sequelize.transaction(async (transaction) => {
            const row = await this.pendingExecution(executionId, transaction);
            await row.update({ status: 'failed', failureCode }, { transaction });
            await this.recordEvent(row, 'failed', failureCode, transaction);
        });
    }

    private async pendingExecution(id: string, transaction: Transaction): Promise<SwapExecution> {
        const row = await SwapExecution.findOne({ where: { id, status: 'pending' }, transaction });
        if (!row) {
            throw new Error(`Pending swap execution ${id} was not found`);
        }
        return row;
    }

    private recordEvent(
        execution: SwapExecution,
        status: 'attempted' | 'succeeded' | 'failed',
        reasonCode: string | undefined,
        transaction: Transaction,
    ): Promise<ProductEvent> {
        return ProductEvent.create(
            {
                eventName: 'swap.execution',
                source: 'backend',
                status,
                userId: execution.userId,
                requestId: execution.traceId,
                reasonCode: reasonCode ?? null,
                metadata: {
                    executionId: execution.id,
                    preparationId: execution.preparationId,
                    providerId: execution.providerId,
                    ...(execution.intentHash ? { intentHash: execution.intentHash } : {}),
                },
            },
            { transaction },
        );
    }

    private toPreparation(row: SwapPreparation): StoredSwapPreparation {
        return {
            id: row.id,
            providerId: row.providerId,
            executionMode: row.executionMode,
            userAddress: row.userAddress,
            userChainType: row.userChainType,
            executionPayload: row.executionPayload,
            expiresAt: row.expiresAt,
        };
    }
}
