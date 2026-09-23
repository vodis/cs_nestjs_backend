import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { OneClickApiHttpClient } from '../../../../http-clients/one-click-api/one-click-api.http-client';
import { ExecuteSwapCommand } from '../../application/ports/execution-provider.port';
import { OneClickExecutionProvider } from './one-click-execution.provider';

describe('OneClickExecutionProvider', () => {
    const message = JSON.stringify({ signer_id: 'alice.near', deadline: '2026-06-11T12:00:00.000Z', intents: [] });
    const command: ExecuteSwapCommand = {
        providerId: 'one-click',
        executionMode: 'intent_sign',
        executionPayload: {
            intent: {
                standard: 'nep413',
                payload: { message, nonce: 'nonce', recipient: 'intents.near' },
            },
        },
        signature: {
            standard: 'nep413',
            payload: { message, nonce: 'nonce', recipient: 'intents.near' },
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
        const signedData = {
            standard: 'nep413',
            payload: { message, nonce: 'nonce', recipient: 'intents.near' },
            signature: 'sig',
            public_key: 'key',
        };
        const client = {
            submitIntent: jest.fn().mockResolvedValue({ intentHash: 'intent-hash', correlationId: 'correlation-1' }),
        } as unknown as OneClickApiHttpClient;
        const provider = new OneClickExecutionProvider(client);

        await provider.execute({ ...command, signature: { signature: 'sig', signedData } });

        expect(client.submitIntent).toHaveBeenCalledWith({ type: 'swap_transfer', signedData });
    });

    it('combines an EVM signature with the approved generated intent', async () => {
        const evmMessage = JSON.stringify({
            signer_id: '0x380b8fa1ebfe8a652dbb55c5a7dec2c683bbd8b9',
            deadline: '2026-06-11T12:00:00.000Z',
            intents: [],
        });
        const client = {
            submitIntent: jest.fn().mockResolvedValue({ intentHash: 'intent-hash', correlationId: 'correlation-1' }),
        } as unknown as OneClickApiHttpClient;
        const provider = new OneClickExecutionProvider(client);

        await provider.execute({
            ...command,
            userAddress: '0x380b8fa1ebfe8a652dbb55c5a7dec2c683bbd8b9',
            userChainType: 'evm',
            executionPayload: { intent: { standard: 'erc191', payload: evmMessage } },
            signature: { signature: '0xsig' },
        });

        expect(client.submitIntent).toHaveBeenCalledWith({
            type: 'swap_transfer',
            signedData: { standard: 'erc191', payload: evmMessage, signature: '0xsig' },
        });
    });

    it('rejects signed data that differs from the approved generated intent', async () => {
        const client = { submitIntent: jest.fn() } as unknown as OneClickApiHttpClient;
        const provider = new OneClickExecutionProvider(client);

        await expect(
            provider.execute({
                ...command,
                signature: {
                    ...command.signature,
                    payload: { message, nonce: 'different', recipient: 'intents.near' },
                },
            }),
        ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_SIGNED_INTENT' }) });
        expect(client.submitIntent).not.toHaveBeenCalled();
    });

    it('rejects signed data that omits an approved NEP-413 callback URL', async () => {
        const client = { submitIntent: jest.fn() } as unknown as OneClickApiHttpClient;
        const provider = new OneClickExecutionProvider(client);

        await expect(
            provider.execute({
                ...command,
                executionPayload: {
                    intent: {
                        standard: 'nep413',
                        payload: {
                            message,
                            nonce: 'nonce',
                            recipient: 'intents.near',
                            callbackUrl: 'https://callback',
                        },
                    },
                },
            }),
        ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_SIGNED_INTENT' }) });
        expect(client.submitIntent).not.toHaveBeenCalled();
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
