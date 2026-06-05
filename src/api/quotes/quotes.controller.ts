import { Body, Controller, Post } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { CreateOneClickQuoteRequestDto } from './dto/create-one-click-quote-request.dto';
import { CreateOneClickQuoteResponseDto } from './dto/create-one-click-quote-response.dto';
import { QuotesService } from './quotes.service';

@Controller({ version: '1', path: 'quotes' })
export class QuotesController {
    constructor(private readonly quotesService: QuotesService) {}

    @Post('one-click')
    @ApiResponse({
        status: 201,
        description: 'Create 1Click quote',
        type: CreateOneClickQuoteResponseDto,
    })
    async createOneClickQuote(@Body() dto: CreateOneClickQuoteRequestDto): Promise<CreateOneClickQuoteResponseDto> {
        return {
            data: await this.quotesService.createOneClickQuote(dto),
        };
    }
}
