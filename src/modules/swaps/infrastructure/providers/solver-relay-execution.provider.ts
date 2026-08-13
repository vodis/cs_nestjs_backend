import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
        const quoteHashes = this.getQuoteHashes(command);
        const signature = this.getSignature(command);

        this.logger.log('Publishing signed swap intent', {
            traceId: command.traceId,
            providerId: this.providerId,
            userChainType: command.userChainType,
            quoteHashCount: quoteHashes.length,
        });

        const result = await this.solverRelayApiHttpClient.publishIntent({
            quoteHashes,
            signedData: signature,
        });

        return { intentHash: result.intent_hash };
    }

    private getQuoteHashes(command: ExecuteSwapCommand): string[] {
        const quoteHashes = command.executionPayload?.quoteHashes ?? command.quoteHashes;

        if (!Array.isArray(quoteHashes) || quoteHashes.some((hash) => typeof hash !== 'string' || !hash.length)) {
            throw new BadRequestException({
                code: 'MISSING_QUOTE_HASHES',
                message: 'Solver relay execution requires quoteHashes from the prepare execution package',
            });
        }

        return quoteHashes;
    }

    private getSignature(command: ExecuteSwapCommand): Record<string, unknown> {
        const signature = command.executionPayload?.signature ?? command.signature;

        if (!signature || typeof signature !== 'object' || Array.isArray(signature)) {
            throw new BadRequestException({
                code: 'MISSING_SIGNATURE',
                message: 'Solver relay execution requires a signed intent payload',
            });
        }

        return signature as Record<string, unknown>;
    }
}
