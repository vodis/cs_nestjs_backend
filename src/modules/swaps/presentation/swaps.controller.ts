import { SwapAttemptDto } from './dto/swap-attempt.dto';
import { GetSpendableSwapUseCase } from '../application/use-cases/get-spendable-swap.use-case';
import { SpendableSwapDto } from './dto/spendable-swap.dto';
import { ListSwapHistoryUseCase, RecordSwapAttemptUseCase } from '../application/use-cases/swap-history.use-cases';
import {
    Query,
    BadRequestException,
    Body,
    Controller,
    Get,
    Headers,
    Param,
    ParseUUIDPipe,
    Post,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiResponse } from '@nestjs/swagger';
import { CurrentUser } from '../../../api/auth/current-user.decorator';
import { PrivyAuthGuard, RequirePrivyBearer } from '../../../api/auth/privy-auth.guard';
import type { AuthenticatedUser } from '../../../api/auth/types';
import { ExecuteSwapUseCase } from '../application/use-cases/execute-swap.use-case';
import { PrepareSwapUseCase } from '../application/use-cases/prepare-swap.use-case';
import { GetSwapStatusUseCase } from '../application/use-cases/get-swap-status.use-case';
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
        private readonly getSwapStatusUseCase: GetSwapStatusUseCase,
        private readonly listHistory: ListSwapHistoryUseCase,
        private readonly recordAttempt: RecordSwapAttemptUseCase,
        private readonly spendable: GetSpendableSwapUseCase,
    ) {}

    @Post('prepare')
    @UseGuards(PrivyAuthGuard)
    @RequirePrivyBearer()
    @ApiBearerAuth()
    @ApiResponse({
        status: 201,
        description:
            'Validate swap inputs, aggregate quotes from registered providers, and return an approved prepare package',
        type: PrepareSwapResponseDto,
    })
    async prepareSwap(
        @Body() dto: PrepareSwapRequestDto,
        @CurrentUser() user: AuthenticatedUser,
    ): Promise<PrepareSwapResponseDto> {
        try {
            const packageResult = await this.prepareSwapUseCase.execute(PrepareSwapMapper.toCommand(dto), user);

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

    @Post('spendable')
    @UseGuards(PrivyAuthGuard)
    @RequirePrivyBearer()
    async getSpendable(@Body() input: SpendableSwapDto, @CurrentUser() user: AuthenticatedUser) {
        return { data: await this.spendable.execute(input, user.id) };
    }

    @Get('policy')
    getPolicy() {
        return { data: { maxSlippageBps: this.prepareSwapUseCase.getMaxSlippageBps() } };
    }

    @Get('history')
    @UseGuards(PrivyAuthGuard)
    @RequirePrivyBearer()
    @ApiBearerAuth()
    async getHistory(@CurrentUser() user: AuthenticatedUser, @Query('before') before?: unknown) {
        return { data: await this.listHistory.execute(user.id, before) };
    }

    @Post(':preparationId/attempt')
    @UseGuards(PrivyAuthGuard)
    @RequirePrivyBearer()
    @ApiBearerAuth()
    async startAttempt(
        @Param('preparationId', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthenticatedUser,
        @Body() input: SwapAttemptDto,
    ) {
        await this.recordAttempt.execute(user.id, id, input.state);
        return { data: { preparationId: id } };
    }

    @Get('status/:preparationId')
    @UseGuards(PrivyAuthGuard)
    @RequirePrivyBearer()
    @ApiBearerAuth()
    async getSwapStatus(
        @Param('preparationId', ParseUUIDPipe) preparationId: string,
        @CurrentUser() user: AuthenticatedUser,
    ): Promise<{ data: { status: string } }> {
        return { data: await this.getSwapStatusUseCase.execute(preparationId, user) };
    }

    @Post('execute')
    @UseGuards(PrivyAuthGuard)
    @RequirePrivyBearer()
    @ApiBearerAuth()
    @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Stable key for one logical execution' })
    @ApiResponse({
        status: 201,
        description: 'Submit a signed swap package to the provider selected during prepare',
        type: ExecuteSwapResponseDto,
    })
    async executeSwap(
        @Body() dto: ExecuteSwapRequestDto,
        @CurrentUser() user: AuthenticatedUser,
        @Headers('idempotency-key') idempotencyKey?: string,
    ): Promise<ExecuteSwapResponseDto> {
        return {
            data: await this.executeSwapUseCase.execute(dto, user, idempotencyKey),
        };
    }
}
