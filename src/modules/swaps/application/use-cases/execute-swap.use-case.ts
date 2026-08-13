import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SolverRelayApiHttpClient } from '../../../../http-clients/solver-relay-api/solver-relay-api.http-client';

export type ExecuteSwapCommand = {
    signature: Record<string, unknown>;
    quoteHashes: string[];
    userAddress: string;
    userChainType: 'evm' | 'near';
    traceId: string;
};

@Injectable()
export class ExecuteSwapUseCase {
    private readonly logger = new Logger(ExecuteSwapUseCase.name);

    constructor(private readonly solverRelayApiHttpClient: SolverRelayApiHttpClient) {}

    async execute(command: ExecuteSwapCommand): Promise<{ intentHash: string }> {
        this.validate(command);

        this.logger.log('Publishing signed swap intent', {
            traceId: command.traceId,
            userChainType: command.userChainType,
            quoteHashCount: command.quoteHashes.length,
        });

        const result = await this.solverRelayApiHttpClient.publishIntent({
            quoteHashes: command.quoteHashes,
            signedData: command.signature,
        });

        return { intentHash: result.intent_hash };
    }

    private validate(command: ExecuteSwapCommand): void {
        if (command.quoteHashes.length === 0) {
            throw new BadRequestException({
                code: 'MISSING_QUOTE_HASHES',
                message: 'At least one quote hash is required',
            });
        }

        if (command.userChainType === 'near' && !/^[a-z0-9._-]+\.(?:near|testnet|tg)$/i.test(command.userAddress)) {
            throw new BadRequestException({
                code: 'INVALID_NEAR_SIGNER',
                message: 'NEAR swaps require a NEAR account id',
            });
        }

        if (command.userChainType === 'evm' && !/^0x[a-fA-F0-9]{40}$/.test(command.userAddress)) {
            throw new BadRequestException({
                code: 'INVALID_EVM_SIGNER',
                message: 'EVM swaps require an EVM address',
            });
        }
    }
}
