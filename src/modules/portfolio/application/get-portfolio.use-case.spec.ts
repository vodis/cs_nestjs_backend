import { GetPortfolioUseCase } from './get-portfolio.use-case';

describe('GetPortfolioUseCase', () => {
    it('returns valued positions without account identity or wallet addresses', async () => {
        const balances = {
            balancesForUser: jest.fn().mockResolvedValue([
                {
                    walletId: 'wallet-secret',
                    chain: 'near',
                    assetId: 'near',
                    symbol: 'NEAR',
                    quantity: '2',
                    balanceUpdatedAt: new Date('2026-08-19T12:00:00Z'),
                },
                {
                    walletId: 'wallet-other',
                    chain: 'near',
                    assetId: 'usdc',
                    symbol: 'USDC',
                    quantity: '1',
                    balanceUpdatedAt: new Date('2026-08-19T11:58:00Z'),
                },
            ]),
        };
        const assets = {
            getAssets: jest.fn().mockResolvedValue([
                { assetId: 'near', priceUsd: '3.5', priceUpdatedAt: '2026-08-19T11:59:00Z' },
                { assetId: 'usdc', priceUsd: '1', priceUpdatedAt: '2026-08-19T11:57:00Z' },
            ]),
        };
        const result = await new GetPortfolioUseCase(balances as never, assets).execute('user-secret');

        expect(result.totalValue).toBe('8');
        expect(result.asOf).toBe('2026-08-19T11:57:00.000Z');
        expect(result.positions[0]).toEqual(
            expect.objectContaining({ symbol: 'NEAR', valueUsd: '7', allocationPercent: '87.50' }),
        );
        expect(JSON.stringify(result)).not.toContain('wallet-secret');
        expect(JSON.stringify(result)).not.toContain('user-secret');
        expect(JSON.stringify(result)).not.toContain('email');
    });

    it('marks assets without a price instead of inventing a valuation', async () => {
        const balances = {
            balancesForUser: jest.fn().mockResolvedValue([
                {
                    walletId: 'w',
                    chain: 'near',
                    assetId: 'unknown',
                    symbol: 'NEW',
                    quantity: '10',
                    balanceUpdatedAt: new Date(),
                },
            ]),
        };
        const result = await new GetPortfolioUseCase(balances as never, { getAssets: async () => [] }).execute('u');
        expect(result.totalValue).toBe('0');
        expect(result.unpricedPositionCount).toBe(1);
        expect(result.positions[0].valueUsd).toBeNull();
    });

    it('returns a null snapshot timestamp when no current balances exist', async () => {
        const result = await new GetPortfolioUseCase({ balancesForUser: async () => [] } as never, {
            getAssets: async () => [],
        }).execute('u');
        expect(result.asOf).toBeNull();
    });
});
