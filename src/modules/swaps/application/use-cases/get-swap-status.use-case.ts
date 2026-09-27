import { BadGatewayException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../../api/auth/types';
import {
    OneClickApiHttpClient,
    OneClickSwapStatus,
} from '../../../../http-clients/one-click-api/one-click-api.http-client';
import { SWAP_EXECUTION_STORE, SwapExecutionStorePort } from '../ports/swap-execution-store.port';
import { SWAP_WALLET_AUTHORIZATION, SwapWalletAuthorizationPort } from '../ports/swap-wallet-authorization.port';

@Injectable()
export class GetSwapStatusUseCase {
    constructor(
        @Inject(SWAP_EXECUTION_STORE) private readonly executionStore: SwapExecutionStorePort,
        @Inject(SWAP_WALLET_AUTHORIZATION) private readonly walletAuthorization: SwapWalletAuthorizationPort,
        private readonly oneClickApiHttpClient: OneClickApiHttpClient,
    ) {}

    async execute(preparationId: string, actor: AuthenticatedUser): Promise<{ status: OneClickSwapStatus }> {
        const preparation = await this.executionStore.findPreparation(preparationId);
        if (!preparation || preparation.providerId !== 'one-click') {
            throw new NotFoundException('Swap preparation was not found');
        }
        const owned = await this.walletAuthorization.isOwnedByUser(
            actor.id,
            preparation.userAddress,
            preparation.userChainType,
        );
        if (!owned) {
            throw new ForbiddenException('Swap status requires an active wallet owned by the authenticated user');
        }
        const depositAddress = preparation.executionPayload.depositAddress;
        const depositMemo = preparation.executionPayload.depositMemo;
        if (typeof depositAddress !== 'string' || !depositAddress) {
            throw new BadGatewayException('Prepared swap has no 1Click deposit address');
        }
        const response = await this.oneClickApiHttpClient.getSwapStatus(
            depositAddress,
            typeof depositMemo === 'string' ? depositMemo : undefined,
        );
        if (
            ![
                'KNOWN_DEPOSIT_TX',
                'PENDING_DEPOSIT',
                'INCOMPLETE_DEPOSIT',
                'PROCESSING',
                'SUCCESS',
                'REFUNDED',
                'FAILED',
            ].includes(response.status)
        ) {
            throw new BadGatewayException('1Click returned an unknown swap status');
        }
        return { status: response.status };
    }
}
