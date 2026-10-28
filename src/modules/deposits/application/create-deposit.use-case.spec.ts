import { CreateDepositUseCase } from './create-deposit.use-case';
import { DepositInstructions, ReceiveWallet } from './deposit.ports';

describe('CreateDepositUseCase', () => {
    const wallet: ReceiveWallet = { id: 'wallet', address: 'receiver', chainType: 'evm' };
    const instructions: DepositInstructions = {
        amount: '1',
        minimumReceived: '0.9',
        assetId: 'asset',
        network: 'eip155:8453',
        walletId: wallet.id,
        recipient: wallet.address,
        address: 'deposit',
        expiresAt: '2099-01-01T00:00:00Z',
    };
    const wallets = { selected: jest.fn<Promise<ReceiveWallet | null>, [string]>() };
    const provider = { create: jest.fn<Promise<DepositInstructions>, [ReceiveWallet, string, string]>() };
    let useCase: CreateDepositUseCase;
    beforeEach(() => {
        jest.resetAllMocks();
        wallets.selected.mockResolvedValue(wallet);
        provider.create.mockResolvedValue(instructions);
        useCase = new CreateDepositUseCase(wallets, provider);
    });

    it('resolves ownership from the authenticated user and allocates a fresh quote for each sequential request', async () => {
        expect(await useCase.execute('user', wallet.id, 'asset', '1')).toEqual(instructions);
        expect(await useCase.execute('user', wallet.id, 'asset', '1')).toEqual(instructions);
        expect(wallets.selected).toHaveBeenCalledWith('user');
        expect(provider.create).toHaveBeenCalledTimes(2);
    });
    it('rejects another wallet or an unlinked wallet before calling the provider', async () => {
        await expect(useCase.execute('user', 'other-wallet', 'asset', '1')).rejects.toThrow('active linked');
        wallets.selected.mockResolvedValue(null);
        await expect(useCase.execute('other-user', wallet.id, 'asset', '1')).rejects.toThrow('active linked');
        expect(provider.create).not.toHaveBeenCalled();
    });
    it('discards a response if the selected wallet changed during quote creation', async () => {
        wallets.selected.mockResolvedValueOnce(wallet).mockResolvedValueOnce(null);
        await expect(useCase.execute('user', wallet.id, 'asset', '1')).rejects.toThrow('changed');
    });
    it('shares concurrent requests without sharing across users', async () => {
        await Promise.all([
            useCase.execute('user', wallet.id, 'asset', '1'),
            useCase.execute('user', wallet.id, 'asset', '1'),
        ]);
        expect(provider.create).toHaveBeenCalledTimes(1);
        await useCase.execute('other-user', wallet.id, 'asset', '1');
        expect(provider.create).toHaveBeenCalledTimes(2);
    });
});
