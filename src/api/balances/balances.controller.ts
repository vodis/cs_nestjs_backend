import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrivyAuthGuard } from '../auth/privy-auth.guard';
import type { AuthenticatedUser } from '../auth/types';
import { BalancesService } from './balances.service';
import { GetBalancesQueryDto } from './dto/get-balances-query.dto';
import { GetBalancesResponseDto } from './dto/get-balances-response.dto';
import { PostBalancesRequestDto } from './dto/post-balances-request.dto';

@ApiTags('balances')
@ApiBearerAuth()
@Controller({ version: '1', path: 'balances' })
@UseGuards(PrivyAuthGuard)
export class BalancesController {
    constructor(private readonly balancesService: BalancesService) {}

    @Get()
    @ApiOkResponse({ type: GetBalancesResponseDto })
    getBalances(@CurrentUser() user: AuthenticatedUser, @Query() query: GetBalancesQueryDto) {
        return this.balancesService.getBalances(user, query);
    }

    @Post()
    @ApiOkResponse({ type: GetBalancesResponseDto })
    postBalances(@CurrentUser() user: AuthenticatedUser, @Body() body: PostBalancesRequestDto) {
        return this.balancesService.getBalances(user, body);
    }
}
