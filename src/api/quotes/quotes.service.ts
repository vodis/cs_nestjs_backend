import { Injectable } from '@nestjs/common';
import {
    OneClickApiHttpClient,
    OneClickQuoteRequest,
} from '../../http-clients/one-click-api/one-click-api.http-client';
import { CreateOneClickQuoteRequestDto } from './dto/create-one-click-quote-request.dto';

@Injectable()
export class QuotesService {
    constructor(private readonly oneClickApiHttpClient: OneClickApiHttpClient) {}

    async createOneClickQuote(dto: CreateOneClickQuoteRequestDto): Promise<unknown> {
        return this.oneClickApiHttpClient.createQuote(this.toOneClickQuoteRequest(dto));
    }

    private toOneClickQuoteRequest(dto: CreateOneClickQuoteRequestDto): OneClickQuoteRequest {
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
            isConfidential: dto.isConfidential,
        };
    }
}
