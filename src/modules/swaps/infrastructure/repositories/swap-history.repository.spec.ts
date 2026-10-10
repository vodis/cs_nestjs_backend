import { Sequelize } from 'sequelize-typescript';
import { SwapPreparation } from '../../../../database/models/swap-preparation.model';
import { SwapHistoryRepository } from './swap-history.repository';
import { parseSwapReceipt } from '../../domain/models/swap-history';

describe('durable swap history', () => {
    let db: Sequelize;
    const history = new SwapHistoryRepository();
    const owner = '11111111-1111-4111-8111-111111111111';
    beforeEach(async () => {
        db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false, models: [SwapPreparation] });
        await db.sync({ force: true });
    });
    afterEach(async () => {
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
