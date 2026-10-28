import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { formatTokenAmount, isValidTokenDecimals } from '../../../utils/decimal.util';
import { AssetsService } from '../../../api/assets/assets.service';
import { OneClickApiHttpClient } from '../../../http-clients/one-click-api/one-click-api.http-client';
import { SwapAddressValidationService } from '../../swaps/domain/services/swap-address-validation.service';
import { DepositInstructions, DepositProvider, ReceiveWallet } from '../application/deposit.ports';

@Injectable()
export class OneClickDepositAdapter extends DepositProvider {
    constructor(
        private readonly assets: AssetsService,
        private readonly client: OneClickApiHttpClient,
    ) {
        super();
    }

    async create(wallet: ReceiveWallet, assetId: string, amount: string): Promise<DepositInstructions> {
        const asset = await this.assets.findAssetById(assetId);
        if (!asset?.sourceNetwork || !asset.defuseAssetId)
            throw new BadRequestException('Receiving is unavailable for this asset');
        const network = asset.sourceNetwork;
        const family = network.startsWith('eip155:')
            ? 'evm'
            : network.startsWith('near:')
              ? 'near'
              : network.startsWith('solana:')
                ? 'solana'
                : network.startsWith('bip122:')
                  ? 'bitcoin'
                  : network === 'ton:mainnet'
                    ? 'ton'
                    : undefined;
        const walletFamily = wallet.chainType === 'ethereum' ? 'evm' : wallet.chainType;
        if (!family || family !== walletFamily)
            throw new BadRequestException('The selected wallet cannot receive on this network');
        const addresses = new SwapAddressValidationService();
        try {
            addresses.assertExternalRecipient(wallet.address, 'DESTINATION_CHAIN', asset.blockchain);
        } catch {
            throw new BadRequestException('The selected wallet address is not valid for this network');
        }
        const deadline = new Date(Date.now() + (family === 'bitcoin' ? 120 : 15) * 60_000).toISOString();
        if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(amount) || amount.length > 80 || !isValidTokenDecimals(asset.decimals))
            throw new BadRequestException('Enter a valid deposit amount');
        const [whole, fraction = ''] = amount.split('.');
        if (fraction.length > asset.decimals) throw new BadRequestException('Amount exceeds token precision');
        const atomic = BigInt(whole + fraction.padEnd(asset.decimals, '0')).toString();
        if (atomic === '0') throw new BadRequestException('Deposit amount must be positive');
        const response = await this.client.createQuote({
            dry: false,
            swapType: 'EXACT_INPUT',
            amount: atomic,
            slippageTolerance: 0,
            originAsset: asset.defuseAssetId,
            destinationAsset: asset.defuseAssetId,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            refundType: 'ORIGIN_CHAIN',
            recipient: wallet.address,
            refundTo: wallet.address,
            deadline,
        });
        if (!record(response) || !record(response.quote) || !record(response.quoteRequest)) throw invalidQuote();
        const echoed = response.quoteRequest;
        if (
            echoed.dry !== false ||
            echoed.swapType !== 'EXACT_INPUT' ||
            echoed.amount !== atomic ||
            echoed.originAsset !== asset.defuseAssetId ||
            echoed.destinationAsset !== asset.defuseAssetId ||
            echoed.recipient !== wallet.address ||
            echoed.refundTo !== wallet.address ||
            echoed.depositType !== 'ORIGIN_CHAIN' ||
            echoed.recipientType !== 'DESTINATION_CHAIN' ||
            echoed.refundType !== 'ORIGIN_CHAIN'
        )
            throw invalidQuote();
        const quote = response.quote;
        if (!text(quote.depositAddress) || !text(quote.deadline)) throw invalidQuote();
        const expiry = Math.min(Date.parse(quote.deadline), Date.parse(deadline));
        if (!Number.isFinite(expiry) || expiry <= Date.now()) throw invalidQuote();
        if (quote.depositMemo != null && !text(quote.depositMemo)) throw invalidQuote();
        try {
            addresses.assertExternalRecipient(quote.depositAddress, 'DESTINATION_CHAIN', asset.blockchain);
        } catch {
            throw invalidQuote();
        }
        if (quote.amountIn !== atomic || !positiveAtomic(quote.minAmountOut)) throw invalidQuote();
        return {
            amount,
            minimumReceived: formatTokenAmount(quote.minAmountOut, asset.decimals),
            assetId: asset.assetId,
            network,
            walletId: wallet.id,
            recipient: wallet.address,
            address: quote.depositAddress,
            expiresAt: new Date(expiry).toISOString(),
            ...(typeof quote.depositMemo === 'string' ? { memo: quote.depositMemo } : {}),
        };
    }
}

function record(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value === value.trim() && !/\s/.test(value);
}
function invalidQuote(): BadGatewayException {
    return new BadGatewayException('Deposit instructions are unavailable');
}

function positiveAtomic(value: unknown): value is string {
    return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}
