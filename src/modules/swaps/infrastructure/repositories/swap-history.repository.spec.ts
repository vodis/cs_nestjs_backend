import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { OneClickApiHttpClient } from '../../../../http-clients/one-click-api/one-click-api.http-client';
import { GetSwapStatusUseCase } from '../../application/use-cases/get-swap-status.use-case';
import { Logger } from '@nestjs/common';
import { ProductEvent } from '../../../../database/models/product-event.model';
import { SwapExecution } from '../../../../database/models/swap-execution.model';
import { SequelizeSwapExecutionStore } from './sequelize-swap-execution-store';
import { Sequelize } from 'sequelize-typescript';
import { SwapPreparation } from '../../../../database/models/swap-preparation.model';
import { SwapHistoryRepository } from './swap-history.repository';
import { parseSwapReceipt } from '../../domain/models/swap-history';

describe('durable swap history', () => {
    let db: Sequelize;
    const history = new SwapHistoryRepository();
    const owner = '11111111-1111-4111-8111-111111111111';
    beforeEach(async () => {
        db = new Sequelize({
            dialect: 'sqlite',
            storage: ':memory:',
            logging: false,
            models: [SwapPreparation, SwapExecution, ProductEvent],
        });
        await db.sync({ force: true });
    });
    afterEach(async () => {
        jest.restoreAllMocks();
        await db.close();
    });
    async function prepare() {
        return SwapPreparation.create({
            userId: owner,
            providerId: 'one-click',
            executionMode: 'deposit_address',
            userAddress: 'alice.near',
            userChainType: 'near',
            executionPayload: { secret: 'never-return' },
            expiresAt: new Date(Date.now() + 60_000),
            historyData: {
                sourceAssetId: 'near:native',
                destinationAssetId: 'usdc',
                sourceSymbol: 'NEAR',
                destinationSymbol: 'USDC',
                sourceDecimals: 24,
                destinationDecimals: 6,
                amountIn: '1000000000000000000000000',
                amountOut: '1000000',
                network: 'near:mainnet',
                destinationNetwork: 'near',
                recipient: 'alice.near',
            },
        });
    }
    it('persists an attempted swap across repository instances without exposing executable data', async () => {
        const row = await prepare();
        expect((await history.list(owner)).items).toEqual([]);
        await history.startAttempt(owner, row.id);
        await history.startAttempt(owner, row.id);
        const result = await new SwapHistoryRepository().list(owner);
        expect(result.items).toHaveLength(1);
        expect(result.items[0]).toMatchObject({
            preparationId: row.id,
            status: 'AWAITING_APPROVAL',
            sourceSymbol: 'NEAR',
        });
        expect(JSON.stringify(result)).not.toContain('never-return');
        await row.update({ settlementStatus: 'REFUNDED' });
        expect((await history.list(owner)).items[0].status).toBe('REFUNDED');
    });
    it('never replaces a submitted or settled swap with a delayed cancellation', async () => {
        const row = await prepare();
        await history.startAttempt(owner, row.id, 'SUBMITTED');
        await history.startAttempt(owner, row.id, 'CANCELLED');
        expect((await history.list(owner)).items[0].status).toBe('SUBMITTED');
        await row.update({ settlementStatus: 'SUCCESS' });
        await history.startAttempt(owner, row.id, 'CANCELLED');
        expect((await history.list(owner)).items[0].status).toBe('SUCCESS');
    });
    it('isolates account history and rejects attempts against another account', async () => {
        const row = await prepare();
        await expect(history.startAttempt('other', row.id)).rejects.toThrow('not found');
        expect((await history.list('other')).items).toEqual([]);
    });
    it.each(['SUCCESS', 'REFUNDED', 'FAILED'] as const)(
        'October 16 regression: lists %s without a browser attempt, preserving owner isolation and pagination',
        async (status) => {
            const first = await prepare();
            const second = await prepare();
            await prepare(); // Unattempted quotes must remain hidden.
            await first.update({ settlementStatus: status, createdAt: new Date('2026-10-16T12:25:09Z') });
            await second.update({ settlementStatus: status, createdAt: new Date('2026-10-16T12:28:50Z') });
            await history.startAttempt(owner, first.id, 'CANCELLED'); // Late notification is a no-op.
            expect((await history.list(owner)).items.map((row) => row.preparationId)).toEqual([second.id, first.id]);
            const older = await history.list(owner, { createdAt: second.createdAt, id: second.id });
            expect(older.items.map((row) => row.preparationId)).toEqual([first.id]);
            expect((await history.list('other', { createdAt: second.createdAt, id: second.id })).items).toEqual([]);
            expect((await first.reload()).attemptStartedAt).toBeNull(); // Reading never backfills data.
        },
    );
    it('October 16 regression: settlement and its owner audit persist atomically without browser notifications', async () => {
        const row = await prepare();
        const store = new SequelizeSwapExecutionStore(db);
        const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const failure = new Error('database error with sensitive SQL parameters');
        const write = jest.spyOn(ProductEvent, 'create').mockRejectedValueOnce(failure);
        await expect(store.recordTerminalSettlement(row.id, 'SUCCESS')).rejects.toMatchObject({
            status: 503,
            message: 'Swap storage is temporarily unavailable. Retry the request.',
            response: { code: 'SWAP_PERSISTENCE_UNAVAILABLE', retryable: true },
        });
        expect((await row.reload()).settlementStatus).toBeNull();
        expect((await history.list(owner)).items).toEqual([]);
        expect(log).toHaveBeenCalledWith({
            event: 'swap.persistence_failed',
            operation: 'record_terminal_settlement',
            preparationId: row.id,
        });
        expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive SQL');
        write.mockRestore();
        await store.recordTerminalSettlement(row.id, 'SUCCESS');
        await store.recordTerminalSettlement(row.id, 'SUCCESS');
        await history.startAttempt(owner, row.id, 'SUBMITTED');
        expect((await history.list(owner)).items).toEqual([
            expect.objectContaining({ preparationId: row.id, status: 'SUCCESS' }),
        ]);
        const events = await ProductEvent.findAll();
        expect(events).toHaveLength(1);
        expect(events[0].userId).toBe(owner);
        expect(await SwapExecution.count()).toBe(0); // Wallet deposits do not use the intent relay.
    });
    it('reconciles for the preparing account after unlinking, denies another account and retries a failed write', async () => {
        const row = await prepare();
        const store = new SequelizeSwapExecutionStore(db);
        const ownership = { isOwnedByUser: jest.fn().mockResolvedValue(false) };
        const client = new OneClickApiHttpClient(new HttpService(), new ConfigService());
        const provider = jest.spyOn(client, 'getSwapStatus').mockResolvedValue({ status: 'SUCCESS' });
        const status = new GetSwapStatusUseCase(store, ownership, client);
        const actor = { id: owner, privyUserId: 'test', sessionId: 'test', passkeyEnabled: false };
        await row.update({ executionPayload: { depositAddress: 'deposit.near' } });
        await expect(status.execute(row.id, { ...actor, id: 'other' })).rejects.toThrow('not found');
        expect(provider).not.toHaveBeenCalled();
        jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const write = jest.spyOn(ProductEvent, 'create').mockRejectedValueOnce(new Error('temporarily unavailable'));
        await expect(status.execute(row.id, actor)).rejects.toThrow('Swap storage is temporarily unavailable');
        write.mockRestore();
        await expect(status.execute(row.id, actor)).resolves.toEqual({ status: 'SUCCESS' });
        await expect(status.execute(row.id, actor)).resolves.toEqual({ status: 'SUCCESS' });
        expect(provider).toHaveBeenCalledTimes(2);
        expect(ownership.isOwnedByUser).not.toHaveBeenCalled();
        expect((await history.list(owner)).items).toHaveLength(1);
    });
    it('rejects preparation persistence failure before returning a package and logs no payload', async () => {
        const row = await prepare();
        const store = new SequelizeSwapExecutionStore(db);
        const preparation = await store.findPreparation(row.id);
        if (!preparation) throw new Error('Missing test preparation');
        const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const failure = new Error('sensitive SQL');
        jest.spyOn(SwapPreparation, 'create').mockRejectedValueOnce(failure);
        await expect(store.createPreparation(preparation)).rejects.toMatchObject({
            status: 503,
            message: 'Swap storage is temporarily unavailable. Retry the request.',
            response: { code: 'SWAP_PERSISTENCE_UNAVAILABLE', retryable: true },
        });
        expect(log).toHaveBeenCalledWith({ event: 'swap.persistence_failed', operation: 'create_preparation' });
        expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive SQL');
        expect(await SwapPreparation.count()).toBe(1);
    });
    it('logs and propagates attempt write failures, then permits an idempotent retry', async () => {
        const row = await prepare();
        const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const failure = new Error('sensitive SQL');
        const write = jest.spyOn(SwapPreparation, 'update').mockRejectedValueOnce(failure);
        await expect(history.startAttempt(owner, row.id)).rejects.toMatchObject({
            status: 503,
            message: 'Swap storage is temporarily unavailable. Retry the request.',
            response: { code: 'SWAP_PERSISTENCE_UNAVAILABLE', retryable: true },
        });
        expect((await row.reload()).attemptStartedAt).toBeNull();
        expect(log).toHaveBeenCalledWith({
            event: 'swap.persistence_failed',
            operation: 'start_attempt',
            preparationId: row.id,
        });
        expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive SQL');
        write.mockRestore();
        await history.startAttempt(owner, row.id);
        await history.startAttempt(owner, row.id);
        expect((await history.list(owner)).items).toHaveLength(1);
    });
    it('does not expose unsafe explorer URLs or invalid settled amounts', () => {
        expect(
            parseSwapReceipt({
                amountOut: '-1',
                amountIn: '100',
                destinationChainTxHashes: [
                    { hash: 'tx', explorerUrl: 'javascript:alert(1)' },
                    { hash: 'safe', explorerUrl: 'https://nearblocks.io/txns/safe' },
                ],
            }),
        ).toEqual({
            amountIn: '100',
            amountOut: undefined,
            refundedAmount: undefined,
            transactions: [{ hash: 'safe', explorerUrl: 'https://nearblocks.io/txns/safe' }],
        });
    });
});
