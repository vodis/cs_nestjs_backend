import { Injectable, Logger } from '@nestjs/common';
import { SolverRelayApiHttpClient } from '../../../../http-clients/solver-relay-api/solver-relay-api.http-client';
import {
    ExecuteSwapCommand,
    ExecuteSwapResult,
    ExecutionProviderPort,
} from '../../application/ports/execution-provider.port';

@Injectable()
export class SolverRelayExecutionProvider implements ExecutionProviderPort {
    readonly providerId = 'solver-relay';
    private readonly logger = new Logger(SolverRelayExecutionProvider.name);

    constructor(private readonly solverRelayApiHttpClient: SolverRelayApiHttpClient) {}

    async execute(command: ExecuteSwapCommand): Promise<ExecuteSwapResult> {
        this.logger.log('Publishing signed swap intent', {
            traceId: command.traceId,
            providerId: this.providerId,
            userChainType: command.userChainType,
            quoteHashCount: command.quoteHashes.length,
        });

        const result = await this.solverRelayApiHttpClient.publishIntent({
            quoteHashes: command.quoteHashes,
            signedData: command.signature,
        });

        return { intentHash: result.intent_hash };
    }
}
