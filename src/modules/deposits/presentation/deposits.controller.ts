import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsString, IsUUID, Length, Matches } from 'class-validator';
import { CurrentUser } from '../../../api/auth/current-user.decorator';
import { PrivyAuthGuard, RequirePrivyBearer } from '../../../api/auth/privy-auth.guard';
import { AuthenticatedUser } from '../../../api/auth/types';
import { CreateDepositUseCase } from '../application/create-deposit.use-case';

export class CreateDepositDto {
    @IsString() @Length(1, 80) @Matches(/^(0|[1-9]\d*)(\.\d+)?$/) amount: string;
    @IsUUID() walletId: string;
    @IsString() @Length(1, 512) assetId: string;
}

@Controller({ version: '1', path: 'deposits' })
@UseGuards(PrivyAuthGuard)
export class DepositsController {
    constructor(private readonly create: CreateDepositUseCase) {}

    @Post('instructions')
    @RequirePrivyBearer()
    async instructions(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateDepositDto) {
        return { data: await this.create.execute(user.id, body.walletId, body.assetId, body.amount) };
    }
}
