import { ForbiddenException } from '@nestjs/common';
import { GetSwapStatusUseCase } from './get-swap-status.use-case';
import { OneClickApiHttpClient } from '../../../../http-clients/one-click-api/one-click-api.http-client';
import { SwapExecutionStorePort } from '../ports/swap-execution-store.port';
import { SwapWalletAuthorizationPort } from '../ports/swap-wallet-authorization.port';

describe('GetSwapStatusUseCase', () => {
    const actor = { id: 'user-1', privyUserId: 'privy-1', sessionId: 'session-1', passkeyEnabled: false };
    const preparation = {
        id: 'preparation-1',
        providerId: 'one-click',
        executionMode: 'intent_sign' as const,
        userAddress: 'alice.near',
        userChainType: 'near' as const,
        executionPayload: { depositAddress: 'deposit-address', depositMemo: 'memo-1' },
        expiresAt: new Date('2030-01-01'),
    };

    it('uses the stored quote address and memo after wallet ownership is checked', async () => {
        const store = { findPreparation: jest.fn().mockResolvedValue(preparation) };
        const authorization = { isOwnedByUser: jest.fn().mockResolvedValue(true) };
        const client = { getSwapStatus: jest.fn().mockResolvedValue({ status: 'SUCCESS' }) };
        const useCase = new GetSwapStatusUseCase(
            store as unknown as SwapExecutionStorePort,
            authorization as unknown as SwapWalletAuthorizationPort,
            client as unknown as OneClickApiHttpClient,
        );
        await expect(useCase.execute(preparation.id, actor)).resolves.toEqual({ status: 'SUCCESS' });
        expect(client.getSwapStatus).toHaveBeenCalledWith('deposit-address', 'memo-1');
    });

    it('refuses status access for a wallet the actor does not own', async () => {
        const store = { findPreparation: jest.fn().mockResolvedValue(preparation) };
        const authorization = { isOwnedByUser: jest.fn().mockResolvedValue(false) };
        const client = { getSwapStatus: jest.fn() };
        const useCase = new GetSwapStatusUseCase(
            store as unknown as SwapExecutionStorePort,
            authorization as unknown as SwapWalletAuthorizationPort,
            client as unknown as OneClickApiHttpClient,
        );
        await expect(useCase.execute(preparation.id, actor)).rejects.toThrow(ForbiddenException);
        expect(client.getSwapStatus).not.toHaveBeenCalled();
    });
});
