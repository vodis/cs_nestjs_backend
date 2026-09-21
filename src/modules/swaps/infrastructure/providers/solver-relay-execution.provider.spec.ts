import { BadRequestException } from '@nestjs/common';
import { SolverRelayApiHttpClient } from '../../../../http-clients/solver-relay-api/solver-relay-api.http-client';
import { ExecuteSwapCommand } from '../../application/ports/execution-provider.port';
import { SolverRelayExecutionProvider } from './solver-relay-execution.provider';

describe('SolverRelayExecutionProvider', () => {
    const command: ExecuteSwapCommand = {
        providerId: 'solver-relay',
        executionMode: 'intent_sign',
        signature: { standard: 'nep413' },
        quoteHashes: ['quote-hash'],
        userAddress: 'alice.near',
        userChainType: 'near',
        traceId: 'trace-1',
    };

    it('continues requiring quote hashes for solver-relay execution', async () => {
        const client = { publishIntent: jest.fn() } as unknown as SolverRelayApiHttpClient;
        const provider = new SolverRelayExecutionProvider(client);

        await expect(provider.execute({ ...command, quoteHashes: [] })).rejects.toBeInstanceOf(BadRequestException);
        expect(client.publishIntent).not.toHaveBeenCalled();
    });
});
