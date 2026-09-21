import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { OneClickApiHttpClient } from '../../../../http-clients/one-click-api/one-click-api.http-client';
import { ExecuteSwapCommand } from '../../application/ports/execution-provider.port';
import { OneClickExecutionProvider } from './one-click-execution.provider';

describe('OneClickExecutionProvider', () => {
    const command: ExecuteSwapCommand = {
        providerId: 'one-click',
        executionMode: 'intent_sign',
        signature: {
            standard: 'nep413',
            payload: { message: 'exact-provider-message', nonce: 'nonce', recipient: 'intents.near' },
            public_key: 'ed25519:public-key',
            signature: 'ed25519:signature',
        },
        userAddress: 'alice.near',
        userChainType: 'near',
        traceId: 'trace-1',
    };

    it('submits the signed data through 1Click', async () => {
        const client = {
            submitIntent: jest.fn().mockResolvedValue({ intentHash: 'intent-hash', correlationId: 'correlation-1' }),
        } as unknown as OneClickApiHttpClient;
        const provider = new OneClickExecutionProvider(client);

        await expect(provider.execute(command)).resolves.toEqual({ intentHash: 'intent-hash' });
        expect(client.submitIntent).toHaveBeenCalledWith({
            type: 'swap_transfer',
            signedData: command.signature,
        });
    });

    it('unwraps connectors that return signedData alongside the signature', async () => {
        const signedData = { standard: 'nep413', payload: {}, signature: 'sig', public_key: 'key' };
        const client = {
            submitIntent: jest.fn().mockResolvedValue({ intentHash: 'intent-hash', correlationId: 'correlation-1' }),
        } as unknown as OneClickApiHttpClient;
        const provider = new OneClickExecutionProvider(client);

        await provider.execute({ ...command, signature: { signature: 'sig', signedData } });

        expect(client.submitIntent).toHaveBeenCalledWith({ type: 'swap_transfer', signedData });
    });

    it('rejects non-signing execution modes', async () => {
        const client = { submitIntent: jest.fn() } as unknown as OneClickApiHttpClient;
        const provider = new OneClickExecutionProvider(client);

        await expect(provider.execute({ ...command, executionMode: 'deposit_address' })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(client.submitIntent).not.toHaveBeenCalled();
    });

    it('rejects a missing signed payload', async () => {
        const client = { submitIntent: jest.fn() } as unknown as OneClickApiHttpClient;
        const provider = new OneClickExecutionProvider(client);

        await expect(provider.execute({ ...command, signature: undefined })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(client.submitIntent).not.toHaveBeenCalled();
    });

    it('rejects a submit response without an intent hash', async () => {
        const client = {
            submitIntent: jest.fn().mockResolvedValue({ correlationId: 'correlation-1' }),
        } as unknown as OneClickApiHttpClient;
        const provider = new OneClickExecutionProvider(client);

        await expect(provider.execute(command)).rejects.toBeInstanceOf(BadGatewayException);
    });
});
