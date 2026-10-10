import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ASSET_REGISTRY_PORT, AssetRegistryPort } from '../ports/asset-registry.port';
import { SWAP_WALLET_AUTHORIZATION, SwapWalletAuthorizationPort } from '../ports/swap-wallet-authorization.port';
import { WALLET_FUNDING, WalletFundingPort } from '../ports/wallet-funding.port';
import { EVM_NETWORKS, NATIVE_ROUTES } from '../../../../api/assets/native-asset-routes';
import { SwapAddressValidationService } from '../../domain/services/swap-address-validation.service';
type SpendableSwapInput = {
    sourceAssetId: string;
    originAsset: string;
    signerId: string;
    network: string;
    authMethod: 'near' | 'evm' | 'ton';
};
@Injectable()
export class GetSpendableSwapUseCase {
    constructor(
        @Inject(ASSET_REGISTRY_PORT) private readonly assets: AssetRegistryPort,
        @Inject(SWAP_WALLET_AUTHORIZATION) private readonly authorization: SwapWalletAuthorizationPort,
        @Inject(WALLET_FUNDING) private readonly funding: WalletFundingPort,
    ) {}
    async execute(input: SpendableSwapInput, userId: string) {
        if (!(await this.authorization.isOwnedByUser(userId, input.signerId, input.authMethod)))
            throw new ForbiddenException('Wallet is not linked');
        const asset = await this.assets.findById(input.originAsset);
        if (!asset) throw new BadRequestException('Unsupported asset');
        const nearNative =
            input.sourceAssetId === 'near:native' &&
            asset.blockchain === 'near' &&
            asset.defuseAssetId.replace(/^1cs_v1:near:/, '') === 'nep141:wrap.near';
        const routeNative =
            input.sourceAssetId === asset.assetId && asset.defuseAssetId === NATIVE_ROUTES[asset.blockchain];
        if (!nearNative && !routeNative) throw new BadRequestException('Select a native asset');
        const network =
            asset.blockchain === 'near'
                ? 'near:mainnet'
                : asset.blockchain === 'ton'
                  ? 'ton:mainnet'
                  : EVM_NETWORKS[asset.blockchain];
        const auth = asset.blockchain === 'near' ? 'near' : asset.blockchain === 'ton' ? 'ton' : 'evm';
        if (!network || network !== input.network || auth !== input.authMethod)
            throw new BadRequestException('Network does not match asset');
        const validation: SwapAddressValidationService = new SwapAddressValidationService();
        validation.assertRefundAddress(auth, input.signerId);
        return {
            amount: await this.funding.nativeMaximum(network, input.signerId),
            network,
            sourceAssetId: input.sourceAssetId,
        };
    }
}
