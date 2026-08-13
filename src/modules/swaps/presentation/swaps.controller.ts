import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ExecuteSwapUseCase } from '../application/use-cases/execute-swap.use-case';
import { PrepareSwapUseCase } from '../application/use-cases/prepare-swap.use-case';
import { SwapValidationError } from '../domain/errors/swap-validation.error';
import { ExecuteSwapRequestDto } from './dto/execute-swap-request.dto';
import { ExecuteSwapResponseDto } from './dto/execute-swap-response.dto';
import { PrepareSwapRequestDto } from './dto/prepare-swap-request.dto';
import { PrepareSwapResponseDto } from './dto/prepare-swap-response.dto';
import { PrepareSwapMapper } from './mappers/prepare-swap.mapper';

@Controller({ version: '1', path: 'swaps' })
export class SwapsController {
    constructor(
        private readonly prepareSwapUseCase: PrepareSwapUseCase,
        private readonly executeSwapUseCase: ExecuteSwapUseCase,
    ) {}

    @Post('prepare')
    @ApiResponse({
        status: 201,
        description:
            'Validate swap inputs, aggregate quotes from registered providers, and return an approved prepare package',
        type: PrepareSwapResponseDto,
    })
    async prepareSwap(@Body() dto: PrepareSwapRequestDto): Promise<PrepareSwapResponseDto> {
        try {
            const packageResult = await this.prepareSwapUseCase.execute(PrepareSwapMapper.toCommand(dto));

            return {
                data: PrepareSwapMapper.toResponseDto(packageResult),
            };
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

    @Post('execute')
    @ApiResponse({
        status: 201,
        description: 'Submit a signed swap package to the provider selected during prepare',
        type: ExecuteSwapResponseDto,
    })
    async executeSwap(@Body() dto: ExecuteSwapRequestDto): Promise<ExecuteSwapResponseDto> {
        return {
            data: await this.executeSwapUseCase.execute(dto),
        };
    }
}
