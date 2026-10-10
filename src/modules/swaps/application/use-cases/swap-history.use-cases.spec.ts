import { SwapHistoryPort } from '../ports/swap-history.port';
import { ListSwapHistoryUseCase, RecordSwapAttemptUseCase } from './swap-history.use-cases';

describe('swap history application boundary', () => {
    const history: jest.Mocked<SwapHistoryPort> = { list: jest.fn(), startAttempt: jest.fn() };
    const list = new ListSwapHistoryUseCase(history);
    beforeEach(() => jest.clearAllMocks());

    it.each([
        'bad-cursor',
        '2026-W41-6|11111111-1111-4111-8111-111111111111',
        [],
        {},
        '2026-10-10T00:00:00.000Z|------------------------------------',
        '2026-10-10T00:00:00.000Z|11111111-1111-4111-8111-111111111111|extra',
        '2026-02-30T00:00:00.000Z|11111111-1111-4111-8111-111111111111',
    ])('rejects malformed cursor %j before storage', (before) => {
        expect(() => list.execute('owner', before)).toThrow('Invalid history cursor');
        expect(history.list).not.toHaveBeenCalled();
    });
    it('binds valid pagination and attempts to the authenticated actor', async () => {
        const id = '11111111-1111-4111-8111-111111111111';
        await list.execute('owner', `2026-10-10T00:00:00.000Z|${id}`);
        expect(history.list).toHaveBeenCalledWith('owner', { createdAt: new Date('2026-10-10T00:00:00.000Z'), id });
        await new RecordSwapAttemptUseCase(history).execute('owner', id, 'SUBMITTED');
        expect(history.startAttempt).toHaveBeenCalledWith('owner', id, 'SUBMITTED');
    });
});
