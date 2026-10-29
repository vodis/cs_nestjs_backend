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

        await new BalancesPortfolioAdapter({} as never, {} as never).balancesForUser('user-1');

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

        const result = await new BalancesPortfolioAdapter(
            { getBalancesForUser } as never,
            {
                getAssets: jest.fn().mockResolvedValue({ data: [] }),
            } as never,
        ).balancesForUser('user-1', { walletAddress: 'alice.tg', network: 'near:mainnet' });

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
            new BalancesPortfolioAdapter(
                balances as never,
                {
                    getAssets: jest.fn().mockResolvedValue({ data: [] }),
                } as never,
            ).balancesForUser('user-1', {
                walletAddress: 'alice.tg',
                network: 'near:mainnet',
            }),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('loads all 1Click-supported NEAR token balances and omits zero positions', async () => {
        const getBalancesForUser = jest.fn().mockImplementation(async (_userId, query) => {
            if (!query.assetIds) {
                return {
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
                };
            }
            return {
                data: [
                    {
                        walletId: null,
                        walletAddress: 'alice.tg',
                        network: 'near:mainnet',
                        assetId: '1cs_v1:near:nep141:zec.omft.near',
                        symbol: 'ZEC',
                        decimals: 8,
                        balanceRaw: '50000000',
                        balanceDecimal: '0.5',
                        fetchedAt: '2026-09-17T12:00:00.000Z',
                    },
                    {
                        walletId: null,
                        walletAddress: 'alice.tg',
                        network: 'near:mainnet',
                        assetId: 'nep141:usdc.near',
                        symbol: 'USDC',
                        decimals: 6,
                        balanceRaw: '0',
                        balanceDecimal: '0',
                        fetchedAt: '2026-09-17T12:00:00.000Z',
                    },
                ],
                meta: { partial: false },
            };
        });
        const assets = {
            getAssets: jest.fn().mockResolvedValue({
                data: [
                    {
                        assetId: '1cs_v1:near:nep141:zec.omft.near',
                        blockchain: 'near',
                    },
                    { assetId: 'nep141:usdc.near', blockchain: 'near' },
                    { assetId: 'eip155:1/native', blockchain: 'eth' },
                ],
            }),
        };

        const result = await new BalancesPortfolioAdapter(
            { getBalancesForUser } as never,
            assets as never,
        ).balancesForUser('user-1', { walletAddress: 'alice.tg', network: 'near:mainnet' });

        expect(getBalancesForUser).toHaveBeenNthCalledWith(2, 'user-1', {
            walletAddress: 'alice.tg',
            network: 'near:mainnet',
            assetIds: ['1cs_v1:near:nep141:zec.omft.near', 'nep141:usdc.near'],
        });
        expect(result).toEqual([
            expect.objectContaining({ assetId: 'near:native', quantity: '2' }),
            expect.objectContaining({ assetId: '1cs_v1:near:nep141:zec.omft.near', quantity: '0.5' }),
        ]);
    });

    it('chunks the 1Click NEAR token catalog into bounded balance requests', async () => {
        const getBalancesForUser = jest.fn().mockResolvedValue({ data: [], meta: { partial: false } });
        const data = Array.from({ length: 21 }, (_, index) => ({
            assetId: `nep141:token-${index}.near`,
            blockchain: 'near',
        }));

        await new BalancesPortfolioAdapter(
            { getBalancesForUser } as never,
            { getAssets: jest.fn().mockResolvedValue({ data }) } as never,
        ).balancesForUser('user-1', { walletAddress: 'alice.tg', network: 'near:mainnet' });

        expect(getBalancesForUser).toHaveBeenCalledTimes(3);
        expect(getBalancesForUser.mock.calls[1][1].assetIds).toHaveLength(20);
        expect(getBalancesForUser.mock.calls[2][1].assetIds).toEqual(['nep141:token-20.near']);
    });

    it('loads NEAR tokens when the linked wallet network is inferred', async () => {
        const getBalancesForUser = jest
            .fn()
            .mockResolvedValueOnce({
                data: [
                    {
                        walletId: 'wallet-1',
                        walletAddress: 'alice.near',
                        network: 'near:mainnet',
                        assetId: 'near:native',
                        symbol: 'NEAR',
                        decimals: 24,
                        balanceRaw: '1',
                        balanceDecimal: '0.000000000000000000000001',
                        fetchedAt: '2026-09-17T12:00:00.000Z',
                    },
                ],
                meta: { partial: false },
            })
            .mockResolvedValueOnce({ data: [], meta: { partial: false } });
        const assets = {
            getAssets: jest.fn().mockResolvedValue({
                data: [{ assetId: '1cs_v1:near:nep141:zec.omft.near', blockchain: 'near' }],
            }),
        };

        await new BalancesPortfolioAdapter({ getBalancesForUser } as never, assets as never).balancesForUser('user-1', {
            walletAddress: 'alice.near',
        });

        expect(getBalancesForUser).toHaveBeenNthCalledWith(2, 'user-1', {
            walletAddress: 'alice.near',
            network: 'near:mainnet',
            assetIds: ['1cs_v1:near:nep141:zec.omft.near'],
        });
    });

    it('does not use the 1Click mainnet token catalog for NEAR testnet', async () => {
        const getBalancesForUser = jest.fn().mockResolvedValue({
            data: [
                {
                    walletId: 'wallet-1',
                    walletAddress: 'alice.testnet',
                    network: 'near:testnet',
                    assetId: 'near:native',
                    symbol: 'NEAR',
                    decimals: 24,
                    balanceRaw: '1',
                    balanceDecimal: '0.000000000000000000000001',
                    fetchedAt: '2026-09-17T12:00:00.000Z',
                },
            ],
            meta: { partial: false },
        });
        const getAssets = jest.fn();

        await new BalancesPortfolioAdapter({ getBalancesForUser } as never, { getAssets } as never).balancesForUser(
            'user-1',
            { walletAddress: 'alice.testnet' },
        );

        expect(getBalancesForUser).toHaveBeenCalledTimes(1);
        expect(getAssets).not.toHaveBeenCalled();
    });
});
