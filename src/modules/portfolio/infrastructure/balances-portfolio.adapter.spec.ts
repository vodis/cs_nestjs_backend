import { ServiceUnavailableException } from '@nestjs/common';
import { Op } from 'sequelize';
import { BalanceCacheEntry } from '../../../database/models/balance-cache-entry.model';
import { WalletLink } from '../../../database/models/wallet-link.model';
import { BalancesPortfolioAdapter } from './balances-portfolio.adapter';

describe('BalancesPortfolioAdapter', () => {
    afterEach(() => jest.restoreAllMocks());

    it('excludes expired cache entries from agent portfolio snapshots', async () => {
        jest.spyOn(WalletLink, 'findAll').mockResolvedValue([{ id: 'wallet-1' }] as never);
        const balances = jest.spyOn(BalanceCacheEntry, 'findAll').mockResolvedValue([]);

        await new BalancesPortfolioAdapter({} as never).balancesForUser('user-1');

        const options = balances.mock.calls[0][0] as { where: Record<string | symbol, unknown> };
        const expiresAt = options.where.expiresAt as Record<symbol, unknown>;
        expect(expiresAt[Op.gt]).toBeInstanceOf(Date);
    });

    it('maps a live external-wallet balance to an internal opaque reference source', async () => {
        const getBalancesForUser = jest.fn().mockResolvedValue({
            data: [
                {
                    walletId: null,
                    walletAddress: 'alice.tg',
                    network: 'near:mainnet',
                    assetId: 'near:native',
                    symbol: 'NEAR',
                    decimals: 24,
                    balanceRaw: '2000000000000000000000000',
                    balanceDecimal: '2',
                    fetchedAt: '2026-09-17T12:00:00.000Z',
                },
            ],
            meta: { partial: false },
        });

        const result = await new BalancesPortfolioAdapter({ getBalancesForUser } as never).balancesForUser('user-1', {
            walletAddress: 'alice.tg',
            network: 'near:mainnet',
        });

        expect(getBalancesForUser).toHaveBeenCalledWith('user-1', {
            walletAddress: 'alice.tg',
            network: 'near:mainnet',
        });
        expect(result).toEqual([
            expect.objectContaining({
                walletReference: 'alice.tg',
                chain: 'near:mainnet',
                assetId: 'near:native',
                quantity: '2',
            }),
        ]);
    });

    it('does not turn a complete provider failure into an empty portfolio', async () => {
        const balances = {
            getBalancesForUser: jest.fn().mockResolvedValue({ data: [], meta: { partial: true } }),
        };

        await expect(
            new BalancesPortfolioAdapter(balances as never).balancesForUser('user-1', {
                walletAddress: 'alice.tg',
                network: 'near:mainnet',
            }),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
});
