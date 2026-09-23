import { Sequelize } from 'sequelize-typescript';
import { ProductEvent } from '../../../../database/models/product-event.model';
import { SwapExecution } from '../../../../database/models/swap-execution.model';
import { SwapPreparation } from '../../../../database/models/swap-preparation.model';
import { SequelizeSwapExecutionStore } from './sequelize-swap-execution-store';

describe('SequelizeSwapExecutionStore', () => {
    let sequelize: Sequelize;
    let store: SequelizeSwapExecutionStore;

    beforeEach(async () => {
        sequelize = new Sequelize({
            dialect: 'sqlite',
            storage: ':memory:',
            logging: false,
            models: [SwapPreparation, SwapExecution, ProductEvent],
        });
        await sequelize.sync({ force: true });
        store = new SequelizeSwapExecutionStore(sequelize);
    });

    afterEach(async () => {
        await sequelize.close();
    });

    it('stores a successful execution once and replays its result', async () => {
        const preparation = await store.createPreparation({
            providerId: 'one-click',
            executionMode: 'intent_sign',
            userAddress: 'alice.near',
            userChainType: 'near',
            executionPayload: { intent: { standard: 'nep413' } },
            expiresAt: new Date(Date.now() + 60_000),
        });
        const input = {
            preparationId: preparation.id,
            userId: '11111111-1111-4111-8111-111111111111',
            idempotencyKey: 'execution-key-1',
            requestFingerprint: 'a'.repeat(64),
            providerId: 'one-click',
            traceId: 'trace-1',
        };

        const claim = await store.claimExecution(input);
        expect(claim).toMatchObject({ state: 'claimed' });
        await store.markSucceeded(claim.executionId, 'intent-hash');

        await expect(store.claimExecution(input)).resolves.toEqual({
            state: 'succeeded',
            executionId: claim.executionId,
            intentHash: 'intent-hash',
        });
        await expect(store.claimExecution({ ...input, idempotencyKey: 'execution-key-2' })).resolves.toEqual({
            state: 'succeeded',
            executionId: claim.executionId,
            intentHash: 'intent-hash',
        });
        const events = await ProductEvent.findAll({ order: [['createdAt', 'ASC']] });
        expect(events.map(({ status }) => status)).toEqual(['attempted', 'succeeded']);
    });

    it('rejects an idempotency key reused with a different fingerprint', async () => {
        const preparation = await store.createPreparation({
            providerId: 'one-click',
            executionMode: 'intent_sign',
            userAddress: 'alice.near',
            userChainType: 'near',
            executionPayload: {},
            expiresAt: new Date(Date.now() + 60_000),
        });
        const input = {
            preparationId: preparation.id,
            userId: '11111111-1111-4111-8111-111111111111',
            idempotencyKey: 'execution-key-1',
            requestFingerprint: 'a'.repeat(64),
            providerId: 'one-click',
            traceId: 'trace-1',
        };
        const claim = await store.claimExecution(input);

        await expect(store.claimExecution({ ...input, requestFingerprint: 'b'.repeat(64) })).resolves.toEqual({
            state: 'conflict',
            executionId: claim.executionId,
        });
    });

    it('records failed execution as an append-only transition', async () => {
        const preparation = await store.createPreparation({
            providerId: 'one-click',
            executionMode: 'intent_sign',
            userAddress: 'alice.near',
            userChainType: 'near',
            executionPayload: {},
            expiresAt: new Date(Date.now() + 60_000),
        });
        const claim = await store.claimExecution({
            preparationId: preparation.id,
            userId: '11111111-1111-4111-8111-111111111111',
            idempotencyKey: 'execution-key-1',
            requestFingerprint: 'a'.repeat(64),
            providerId: 'one-click',
            traceId: 'trace-1',
        });

        await store.markFailed(claim.executionId, 'ONE_CLICK_UNAVAILABLE');

        const events = await ProductEvent.findAll({ order: [['createdAt', 'ASC']] });
        expect(events.map(({ status, reasonCode }) => ({ status, reasonCode }))).toEqual([
            { status: 'attempted', reasonCode: null },
            { status: 'failed', reasonCode: 'ONE_CLICK_UNAVAILABLE' },
        ]);
    });

    it('prioritizes idempotency-key conflicts when a fingerprint also exists', async () => {
        const preparation = await store.createPreparation({
            providerId: 'one-click',
            executionMode: 'intent_sign',
            userAddress: 'alice.near',
            userChainType: 'near',
            executionPayload: {},
            expiresAt: new Date(Date.now() + 60_000),
        });
        const base = {
            preparationId: preparation.id,
            userId: '11111111-1111-4111-8111-111111111111',
            providerId: 'one-click',
            traceId: 'trace-1',
        };
        const first = await store.claimExecution({
            ...base,
            idempotencyKey: 'execution-key-1',
            requestFingerprint: 'a'.repeat(64),
        });
        await store.claimExecution({
            ...base,
            idempotencyKey: 'execution-key-2',
            requestFingerprint: 'b'.repeat(64),
        });

        await expect(
            store.claimExecution({
                ...base,
                idempotencyKey: 'execution-key-1',
                requestFingerprint: 'b'.repeat(64),
            }),
        ).resolves.toEqual({ state: 'conflict', executionId: first.executionId });
    });
});
