import { Test } from '@nestjs/testing';
import { GetSpendableSwapUseCase } from './get-spendable-swap.use-case';
import { ASSET_REGISTRY_PORT } from '../ports/asset-registry.port';
import { SWAP_WALLET_AUTHORIZATION } from '../ports/swap-wallet-authorization.port';
import { WALLET_FUNDING } from '../ports/wallet-funding.port';

describe('native Max authorization and asset binding', () => {
    const request = {
        sourceAssetId: 'near:native',
        originAsset: 'wrap.near',
        signerId: 'alice.near',
        network: 'near:mainnet',
        authMethod: 'near' as const,
    };
    const registry = { findById: jest.fn() };
    const authorization = { isOwnedByUser: jest.fn() };
    const funding = { nativeMaximum: jest.fn() };
    let useCase: GetSpendableSwapUseCase;
    beforeEach(async () => {
        jest.resetAllMocks();
        registry.findById.mockResolvedValue({
            assetId: 'wrap.near',
            defuseAssetId: 'nep141:wrap.near',
            blockchain: 'near',
            symbol: 'NEAR',
            decimals: 24,
        });
        authorization.isOwnedByUser.mockResolvedValue(true);
        funding.nativeMaximum.mockResolvedValue('123');
        const module = await Test.createTestingModule({
            providers: [
                GetSpendableSwapUseCase,
                { provide: ASSET_REGISTRY_PORT, useValue: registry },
                { provide: SWAP_WALLET_AUTHORIZATION, useValue: authorization },
                { provide: WALLET_FUNDING, useValue: funding },
            ],
        }).compile();
        useCase = module.get(GetSpendableSwapUseCase);
    });
    it('returns an estimate bound to the verified source and network', async () => {
        await expect(useCase.execute(request, 'owner')).resolves.toEqual({
            amount: '123',
            sourceAssetId: 'near:native',
            network: 'near:mainnet',
        });
        expect(authorization.isOwnedByUser).toHaveBeenCalledWith('owner', 'alice.near', 'near');
        expect(funding.nativeMaximum).toHaveBeenCalledWith('near:mainnet', 'alice.near');
    });
    it('rejects a wallet belonging to another user before reading private balances', async () => {
        authorization.isOwnedByUser.mockResolvedValue(false);
        await expect(useCase.execute(request, 'other')).rejects.toThrow('Wallet is not linked');
        expect(funding.nativeMaximum).not.toHaveBeenCalled();
    });
    it('rejects token or network mismatches before estimating native funds', async () => {
        await expect(useCase.execute({ ...request, sourceAssetId: 'usdc' }, 'owner')).rejects.toThrow('native asset');
        await expect(useCase.execute({ ...request, network: 'near:testnet' }, 'owner')).rejects.toThrow(
            'Network does not match',
        );
        expect(funding.nativeMaximum).not.toHaveBeenCalled();
    });
});
