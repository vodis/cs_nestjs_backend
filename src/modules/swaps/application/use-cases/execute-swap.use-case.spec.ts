import { BadGatewayException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../../api/auth/types';
import type { ExecuteSwapCommand, ExecutionProviderPort } from '../ports/execution-provider.port';
import type { SwapExecutionStorePort, StoredSwapPreparation } from '../ports/swap-execution-store.port';
import type { SwapWalletAuthorizationPort } from '../ports/swap-wallet-authorization.port';
import { ExecuteSwapUseCase } from './execute-swap.use-case';

describe('ExecuteSwapUseCase', () => {
    const actor: AuthenticatedUser = {
        id: '11111111-1111-4111-8111-111111111111',
        privyUserId: 'privy-user',
        sessionId: 'session-1',
        passkeyEnabled: false,
    };
    const intent = {
        standard: 'nep413',
        payload: {
            message: JSON.stringify({ signer_id: 'alice.near', deadline: '2026-09-24T00:00:00.000Z', intents: [] }),
            nonce: 'nonce',
            recipient: 'intents.near',
        },
    };
    const preparation: StoredSwapPreparation = {
        id: '22222222-2222-4222-8222-222222222222',
        providerId: 'one-click',
        executionMode: 'intent_sign',
        userAddress: 'alice.near',
        userChainType: 'near',
        executionPayload: { intent, correlationId: 'correlation-1', depositAddress: 'deposit.near' },
        expiresAt: new Date(Date.now() + 60_000),
    };
    const command: ExecuteSwapCommand = {
        providerId: 'one-click',
        executionMode: 'intent_sign',
        executionPayload: { ...preparation.executionPayload, preparationId: preparation.id },
        signature: { ...intent, signature: 'ed25519:sig', public_key: 'ed25519:key' },
        quoteHashes: [],
        userAddress: 'alice.near',
        userChainType: 'near',
        traceId: 'trace-1',
    };

    function setup(
        overrides: {
            owned?: boolean;
            claim?: Awaited<ReturnType<SwapExecutionStorePort['claimExecution']>>;
            providerError?: Error;
        } = {},
    ) {
        const provider: ExecutionProviderPort = {
            providerId: 'one-click',
            execute: jest.fn().mockImplementation(async () => {
                if (overrides.providerError) throw overrides.providerError;
                return { intentHash: 'intent-hash' };
            }),
        };
        const store = {
            findPreparation: jest.fn().mockResolvedValue(preparation),
            claimExecution: jest
                .fn()
                .mockResolvedValue(overrides.claim ?? { state: 'claimed', executionId: 'execution-1' }),
            markSucceeded: jest.fn().mockResolvedValue(undefined),
            markFailed: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<SwapExecutionStorePort>;
        const authorization = {
            isOwnedByUser: jest.fn().mockResolvedValue(overrides.owned ?? true),
        } as jest.Mocked<SwapWalletAuthorizationPort>;
        return { useCase: new ExecuteSwapUseCase([provider], store, authorization), provider, store, authorization };
    }

    it('executes an approved request and persists its terminal result', async () => {
        const { useCase, provider, store } = setup();

        await expect(useCase.execute(command, actor, 'execute-123')).resolves.toEqual({ intentHash: 'intent-hash' });

        expect(provider.execute).toHaveBeenCalledWith(
            expect.objectContaining({ executionPayload: preparation.executionPayload }),
        );
        expect(store.markSucceeded).toHaveBeenCalledWith('execution-1', 'intent-hash');
    });

    it('rejects a wallet that is not owned by the authenticated actor', async () => {
        const { useCase, provider } = setup({ owned: false });

        await expect(useCase.execute(command, actor, 'execute-123')).rejects.toBeInstanceOf(ForbiddenException);
        expect(provider.execute).not.toHaveBeenCalled();
    });

    it('returns the stored result when the same request is replayed', async () => {
        const { useCase, provider } = setup({
            claim: { state: 'succeeded', executionId: 'execution-1', intentHash: 'stored-hash' },
        });

        await expect(useCase.execute(command, actor, 'execute-123')).resolves.toEqual({ intentHash: 'stored-hash' });
        expect(provider.execute).not.toHaveBeenCalled();
    });

    it('rejects reuse of an idempotency key for a different request', async () => {
        const { useCase, provider } = setup({ claim: { state: 'conflict', executionId: 'execution-1' } });

        await expect(useCase.execute(command, actor, 'execute-123')).rejects.toBeInstanceOf(ConflictException);
        expect(provider.execute).not.toHaveBeenCalled();
    });

    it('rejects execution payload changes after prepare', async () => {
        const { useCase, provider } = setup();

        await expect(
            useCase.execute(
                { ...command, executionPayload: { ...command.executionPayload, depositAddress: 'attacker.near' } },
                actor,
                'execute-123',
            ),
        ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SWAP_PREPARATION_MISMATCH' }) });
        expect(provider.execute).not.toHaveBeenCalled();
    });

    it('records a terminal failure when provider submission fails', async () => {
        const providerError = new BadGatewayException({ code: 'ONE_CLICK_UNAVAILABLE', message: 'unavailable' });
        const { useCase, store } = setup({ providerError });

        await expect(useCase.execute(command, actor, 'execute-123')).rejects.toBe(providerError);
        expect(store.markFailed).toHaveBeenCalledWith('execution-1', 'ONE_CLICK_UNAVAILABLE');
    });

    it('requires an explicit idempotency key', async () => {
        const { useCase, provider } = setup();

        await expect(useCase.execute(command, actor, undefined)).rejects.toMatchObject({
            response: expect.objectContaining({ code: 'INVALID_IDEMPOTENCY_KEY' }),
        });
        expect(provider.execute).not.toHaveBeenCalled();
    });

    it('uses the same request fingerprint when only tracing metadata changes', async () => {
        const { useCase, store } = setup();

        await useCase.execute(command, actor, 'execute-123');
        await useCase.execute({ ...command, traceId: 'trace-2' }, actor, 'execute-456');

        expect(store.claimExecution.mock.calls[0][0].requestFingerprint).toBe(
            store.claimExecution.mock.calls[1][0].requestFingerprint,
        );
    });
});
