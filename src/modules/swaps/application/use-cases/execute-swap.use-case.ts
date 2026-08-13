import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { EXECUTION_PROVIDERS, ExecuteSwapCommand, ExecutionProviderPort } from '../ports/execution-provider.port';

@Injectable()
export class ExecuteSwapUseCase {
    constructor(
        @Inject(EXECUTION_PROVIDERS)
        private readonly executionProviders: ExecutionProviderPort[],
    ) {}

    async execute(command: ExecuteSwapCommand): Promise<{ intentHash: string }> {
        this.validate(command);

        const provider = this.executionProviders.find((candidate) => candidate.providerId === command.providerId);

        if (!provider) {
            throw new BadRequestException({
                code: 'UNSUPPORTED_SWAP_EXECUTION_PROVIDER',
                message: `Unsupported swap execution provider: ${command.providerId}`,
            });
        }

        return provider.execute(command);
    }

    private validate(command: ExecuteSwapCommand): void {
        if (!command.providerId) {
            throw new BadRequestException({
                code: 'MISSING_PROVIDER_ID',
                message: 'Swap execution requires the providerId returned by prepare',
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
