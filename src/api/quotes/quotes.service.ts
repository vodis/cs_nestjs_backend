import { PreviewSwapDto } from './dto/preview-swap.dto';
import { BadRequestException, Injectable } from '@nestjs/common';
import {
    OneClickApiHttpClient,
    OneClickQuoteRequest,
} from '../../http-clients/one-click-api/one-click-api.http-client';
import { SwapValidationError } from '../../modules/swaps/domain/errors/swap-validation.error';
import { SwapAddressValidationService } from '../../modules/swaps/domain/services/swap-address-validation.service';
import { CreateOneClickQuoteRequestDto } from './dto/create-one-click-quote-request.dto';
import { AssetsService } from '../assets/assets.service';

@Injectable()
export class QuotesService {
    private readonly addressValidationService: SwapAddressValidationService = new SwapAddressValidationService();

    constructor(
        private readonly oneClickApiHttpClient: OneClickApiHttpClient,
        private readonly assetsService: AssetsService,
    ) {}

    async createOneClickQuote(dto: CreateOneClickQuoteRequestDto): Promise<unknown> {
        try {
            const request = this.toOneClickQuoteRequest(dto);

            const [originAsset, destinationAsset] = await Promise.all([
                this.assetsService.findAssetById(dto.originAsset),
                this.assetsService.findAssetById(dto.destinationAsset),
            ]);
            if (!originAsset)
                throw new SwapValidationError('UNSUPPORTED_ASSET', 'Asset is not in the server allowlist', {
                    assetId: dto.originAsset,
                });
            if (!destinationAsset) {
                throw new SwapValidationError('UNSUPPORTED_ASSET', 'Asset is not in the server allowlist', {
                    assetId: dto.destinationAsset,
                });
            }
            this.addressValidationService.assertExternalRecipient(
                request.recipient,
                request.recipientType,
                destinationAsset.blockchain,
            );

            const response = await this.oneClickApiHttpClient.createQuote(request);
            if (dto.dry && response && typeof response === 'object')
                return { ...response, expiresAt: new Date(Date.now() + 30_000).toISOString() };
            return response;
        } catch (error) {
            if (error instanceof SwapValidationError) {
                throw new BadRequestException({
                    code: error.code,
                    message: error.message,
                    details: error.details,
                });
            }

            throw error;
        }
    }

    async preview(dto: PreviewSwapDto) {
        const [origin, destination] = await Promise.all([
            this.assetsService.findAssetById(dto.originAsset),
            this.assetsService.findAssetById(dto.destinationAsset),
        ]);
        if (!origin || !destination)
            throw new BadRequestException({ code: 'UNSUPPORTED_ASSET', message: 'Select supported assets.' });
        if (origin.defuseAssetId === destination.defuseAssetId)
            throw new BadRequestException('Select different assets');
        // Indicative Intents pricing only. No wallet address, deposit package or executable quote is returned.
        const response = await this.oneClickApiHttpClient.createQuote({
            ...dto,
            dry: true,
            originAsset: origin.defuseAssetId,
            destinationAsset: destination.defuseAssetId,
            depositType: 'ORIGIN_CHAIN',
            refundType: 'INTENTS',
            recipientType: 'INTENTS',
            refundTo: '0'.repeat(64),
            recipient: '0'.repeat(64),
            deadline: new Date(Date.now() + 900_000).toISOString(),
        });
        if (
            !response ||
            typeof response !== 'object' ||
            !('quote' in response) ||
            !response.quote ||
            typeof response.quote !== 'object'
        )
            throw new BadRequestException('Preview is unavailable');
        const quote = response.quote;
        if (
            !('amountIn' in quote) ||
            !('amountOut' in quote) ||
            typeof quote.amountIn !== 'string' ||
            typeof quote.amountOut !== 'string' ||
            !/^[1-9]\d*$/.test(quote.amountIn) ||
            !/^[1-9]\d*$/.test(quote.amountOut)
        )
            throw new BadRequestException('Preview amount is unavailable');
        return {
            amountIn: quote.amountIn,
            amountOut: quote.amountOut,
            expiresAt: new Date(Date.now() + 30_000).toISOString(),
            indicative: true,
        };
    }

    private toOneClickQuoteRequest(dto: CreateOneClickQuoteRequestDto): OneClickQuoteRequest {
        this.addressValidationService.assertRefundAddress(dto.authMethod, dto.userAddress);

        const recipientType =
            dto.recipientType ??
            (dto.recipient ? 'DESTINATION_CHAIN' : dto.authMethod === 'near' ? 'INTENTS' : 'DESTINATION_CHAIN');

        return {
            dry: dto.dry,
            swapType: dto.swapType,
            slippageTolerance: dto.slippageTolerance,
            originAsset: dto.originAsset,
            depositType: dto.depositType ?? 'ORIGIN_CHAIN',
            destinationAsset: dto.destinationAsset,
            amount: dto.amount,
            recipient: dto.recipient || dto.userAddress,
            recipientType,
            refundTo: dto.userAddress,
            refundType: dto.refundType ?? (dto.authMethod === 'near' ? 'INTENTS' : 'ORIGIN_CHAIN'),
            deadline: dto.deadline,
        };
    }
}
