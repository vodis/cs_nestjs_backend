import { SwapHistoryCursor, SwapHistoryPort, SwapHistoryPage } from '../../application/ports/swap-history.port';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Op } from 'sequelize';
import { SwapPreparation } from '../../../../database/models/swap-preparation.model';

@Injectable()
export class SwapHistoryRepository implements SwapHistoryPort {
    async list(userId: string, before?: SwapHistoryCursor): Promise<SwapHistoryPage> {
        const rows = await SwapPreparation.findAll({
            where: {
                userId,
                attemptStartedAt: { [Op.ne]: null },
                ...(before
                    ? {
                          [Op.or]: [
                              { createdAt: { [Op.lt]: before.createdAt } },
                              { createdAt: before.createdAt, id: { [Op.lt]: before.id } },
                          ],
                      }
                    : {}),
            },
            order: [
                ['createdAt', 'DESC'],
                ['id', 'DESC'],
            ],
            limit: 51,
        });
        return {
            items: rows.slice(0, 50).flatMap<SwapHistoryPage['items'][number]>((row) =>
                row.historyData
                    ? [
                          {
                              preparationId: row.id,
                              createdAt: row.createdAt.toISOString(),
                              status: row.settlementStatus ?? row.historyData?.submissionState ?? 'UNKNOWN',
                              ...row.historyData,
                          },
                      ]
                    : [],
            ),
            nextCursor: rows.length > 50 ? `${rows[49].createdAt.toISOString()}|${rows[49].id}` : null,
        };
    }

    async startAttempt(
        userId: string,
        preparationId: string,
        state: 'AWAITING_APPROVAL' | 'SUBMITTED' | 'CANCELLED' = 'AWAITING_APPROVAL',
    ): Promise<void> {
        const db = SwapPreparation.sequelize;
        if (!db) throw new Error('Swap history storage is unavailable');
        await db.transaction(async (transaction) => {
            const row = await SwapPreparation.findOne({
                where: { id: preparationId, userId },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!row) throw new NotFoundException('Swap preparation was not found');
            // Serialize browser notifications so an older cancellation cannot replace a submission.
            if (row.settlementStatus || row.historyData?.submissionState === 'SUBMITTED') return;
            await SwapPreparation.update(
                {
                    attemptStartedAt: row.attemptStartedAt ?? new Date(),
                    ...(row.historyData ? { historyData: { ...row.historyData, submissionState: state } } : {}),
                },
                { where: { id: preparationId, userId, settlementStatus: null }, transaction },
            );
        });
    }
}
