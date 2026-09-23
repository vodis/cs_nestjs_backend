import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpException,
    Inject,
    Injectable,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { AuthenticatedUser } from '../../../../api/auth/types';
import { EXECUTION_PROVIDERS, ExecuteSwapCommand, ExecutionProviderPort } from '../ports/execution-provider.port';
import {
    SWAP_EXECUTION_STORE,
    SwapExecutionStorePort,
    StoredSwapPreparation,
} from '../ports/swap-execution-store.port';
import { SWAP_WALLET_AUTHORIZATION, SwapWalletAuthorizationPort } from '../ports/swap-wallet-authorization.port';

@Injectable()
export class ExecuteSwapUseCase {
    constructor(
        @Inject(EXECUTION_PROVIDERS)
        private readonly executionProviders: ExecutionProviderPort[],
        @Inject(SWAP_EXECUTION_STORE)
        private readonly executionStore: SwapExecutionStorePort,
        @Inject(SWAP_WALLET_AUTHORIZATION)
        private readonly walletAuthorization: SwapWalletAuthorizationPort,
    ) {}

    async execute(
        command: ExecuteSwapCommand,
        actor: AuthenticatedUser,
        idempotencyKey: string | undefined,
    ): Promise<{ intentHash: string }> {
        this.validate(command);
        this.validateIdempotencyKey(idempotencyKey);

        const owned = await this.walletAuthorization.isOwnedByUser(
            actor.id,
            command.userAddress,
            command.userChainType,
        );
        if (!owned) {
            throw new ForbiddenException({
                code: 'SWAP_WALLET_NOT_AUTHORIZED',
                message: 'Swap execution requires an active wallet owned by the authenticated user',
            });
        }

        const preparation = await this.loadPreparation(command);
        const canonicalCommand = this.bindToPreparation(command, preparation);

        const provider = this.executionProviders.find(
            (candidate) => candidate.providerId === canonicalCommand.providerId,
        );

        if (!provider) {
            throw new BadRequestException({
                code: 'UNSUPPORTED_SWAP_EXECUTION_PROVIDER',
                message: `Unsupported swap execution provider: ${command.providerId}`,
            });
        }

        const claim = await this.executionStore.claimExecution({
            preparationId: preparation.id,
            userId: actor.id,
            idempotencyKey: idempotencyKey!,
            requestFingerprint: this.fingerprint(canonicalCommand),
            providerId: canonicalCommand.providerId,
            traceId: canonicalCommand.traceId,
        });
        if (claim.state === 'succeeded') {
            return { intentHash: claim.intentHash };
        }
        if (claim.state !== 'claimed') {
            throw new ConflictException({
                code:
                    claim.state === 'conflict'
                        ? 'IDEMPOTENCY_KEY_REUSED'
                        : claim.state === 'pending'
                          ? 'SWAP_EXECUTION_IN_PROGRESS'
                          : 'SWAP_EXECUTION_PREVIOUSLY_FAILED',
                message: 'This swap execution request cannot be submitted again',
            });
        }

        let result: { intentHash: string };
        try {
            result = await provider.execute(canonicalCommand);
        } catch (error) {
            await this.executionStore.markFailed(claim.executionId, this.failureCode(error));
            throw error;
        }
        await this.executionStore.markSucceeded(claim.executionId, result.intentHash);
        return result;
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

    private validateIdempotencyKey(idempotencyKey: string | undefined): void {
        if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
            throw new BadRequestException({
                code: 'INVALID_IDEMPOTENCY_KEY',
                message: 'Idempotency-Key must contain 8 to 128 safe characters',
            });
        }
    }

    private async loadPreparation(command: ExecuteSwapCommand): Promise<StoredSwapPreparation> {
        const preparationId = command.executionPayload?.preparationId;
        if (typeof preparationId !== 'string') {
            throw new BadRequestException({
                code: 'MISSING_SWAP_PREPARATION',
                message: 'Swap execution requires the preparationId returned by prepare',
            });
        }
        const preparation = await this.executionStore.findPreparation(preparationId);
        if (!preparation || preparation.expiresAt.getTime() <= Date.now()) {
            throw new BadRequestException({
                code: 'INVALID_SWAP_PREPARATION',
                message: 'Swap preparation does not exist or has expired',
            });
        }
        return preparation;
    }

    private bindToPreparation(command: ExecuteSwapCommand, preparation: StoredSwapPreparation): ExecuteSwapCommand {
        const normalizedAddress = command.userAddress.trim().toLowerCase();
        if (
            preparation.providerId !== command.providerId ||
            preparation.executionMode !== command.executionMode ||
            preparation.userAddress !== normalizedAddress ||
            preparation.userChainType !== command.userChainType ||
            !this.containsPreparedPayload(command.executionPayload ?? {}, preparation.executionPayload)
        ) {
            throw new BadRequestException({
                code: 'SWAP_PREPARATION_MISMATCH',
                message: 'Swap execution does not match the approved prepare package',
            });
        }

        return {
            ...command,
            userAddress: normalizedAddress,
            executionPayload: preparation.executionPayload,
        };
    }

    private containsPreparedPayload(supplied: Record<string, unknown>, expected: Record<string, unknown>): boolean {
        return Object.entries(expected).every(
            ([key, value]) => this.canonicalJson(supplied[key]) === this.canonicalJson(value),
        );
    }

    private fingerprint(command: ExecuteSwapCommand): string {
        const signature = command.signature?.signedData ?? command.signature;
        return createHash('sha256')
            .update(
                this.canonicalJson({
                    providerId: command.providerId,
                    executionMode: command.executionMode,
                    executionPayload: command.executionPayload,
                    signature,
                    userAddress: command.userAddress,
                    userChainType: command.userChainType,
                }),
            )
            .digest('hex');
    }

    private canonicalJson(value: unknown): string {
        if (Array.isArray(value)) {
            return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
        }
        if (value && typeof value === 'object') {
            const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
                left.localeCompare(right),
            );
            return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${this.canonicalJson(item)}`).join(',')}}`;
        }
        return JSON.stringify(value);
    }

    private failureCode(error: unknown): string {
        if (error instanceof HttpException) {
            const response = error.getResponse();
            if (response && typeof response === 'object' && 'code' in response && typeof response.code === 'string') {
                return response.code;
            }
            return `HTTP_${error.getStatus()}`;
        }
        return 'SWAP_PROVIDER_EXECUTION_FAILED';
    }
}
