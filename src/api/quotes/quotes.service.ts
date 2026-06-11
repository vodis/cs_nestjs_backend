import { BadRequestException, Injectable } from '@nestjs/common';
import { AxiosError } from 'axios';
import {
    OneClickApiHttpClient,
    OneClickQuoteRequest,
} from '../../http-clients/one-click-api/one-click-api.http-client';
import { SwapValidationError } from '../../modules/swaps/domain/errors/swap-validation.error';
import { SwapAddressValidationService } from '../../modules/swaps/domain/services/swap-address-validation.service';
import { CreateOneClickQuoteRequestDto } from './dto/create-one-click-quote-request.dto';

@Injectable()
export class QuotesService {
    private readonly addressValidationService: SwapAddressValidationService = new SwapAddressValidationService();

    constructor(private readonly oneClickApiHttpClient: OneClickApiHttpClient) {}

    async createOneClickQuote(dto: CreateOneClickQuoteRequestDto): Promise<unknown> {
        try {
            return await this.oneClickApiHttpClient.createQuote(this.toOneClickQuoteRequest(dto));
        } catch (error) {
            if (error instanceof SwapValidationError) {
                throw new BadRequestException({
                    code: error.code,
                    message: error.message,
                    details: error.details,
                });
            }

            const axiosError = error as AxiosError;

            if (axiosError.response?.status && axiosError.response.status >= 400 && axiosError.response.status < 500) {
                throw new BadRequestException(axiosError.response.data);
            }

            throw error;
        }
    }

    private toOneClickQuoteRequest(dto: CreateOneClickQuoteRequestDto): OneClickQuoteRequest {
        this.addressValidationService.assertRefundAddress(dto.authMethod, dto.userAddress);

        const userAddressType = dto.authMethod === 'near' ? 'INTENTS' : 'ORIGIN_CHAIN';
        const recipientType = dto.authMethod === 'near' ? 'INTENTS' : 'DESTINATION_CHAIN';

        return {
            dry: dto.dry,
            swapType: dto.swapType,
            slippageTolerance: dto.slippageTolerance,
            originAsset: dto.originAsset,
            depositType: 'ORIGIN_CHAIN',
            destinationAsset: dto.destinationAsset,
            amount: dto.amount,
            recipient: dto.userAddress,
            recipientType,
            refundTo: dto.userAddress,
            refundType: userAddressType,
            deadline: dto.deadline,
        };
    }
}
