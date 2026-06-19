import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PrivySessionDto } from './dto/privy-session.dto';
import { CurrentUser } from './current-user.decorator';
import { PrivyAuthGuard } from './privy-auth.guard';
import { PrivyAuthService } from './privy-auth.service';
import type { AuthenticatedUser } from './types';

type RequestWithCookies = Request & {
    cookies?: Record<string, string>;
};

function extractAccessToken(request: RequestWithCookies): string {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
        return authorization.replace(/^Bearer\s+/i, '');
    }
    return request.cookies?.['privy-token'] || '';
}

function serializeWallet(wallet: {
    id: string;
    privyWalletId: string;
    address: string;
    chainType: string;
    walletType: string;
    isPrimary: boolean;
}) {
    return {
        id: wallet.id,
        privyWalletId: wallet.privyWalletId,
        address: wallet.address,
        chainType: wallet.chainType,
        walletType: wallet.walletType,
        isPrimary: wallet.isPrimary,
    };
}

@Controller({ version: '1' })
export class AuthController {
    constructor(private readonly authService: PrivyAuthService) {}

    @Post('auth/privy/session')
    async upsertPrivySession(@Req() request: RequestWithCookies, @Body() body: PrivySessionDto) {
        const result = await this.authService.upsertSession(extractAccessToken(request), body);
        return {
            user: result.user,
            wallets: result.wallets.map(serializeWallet),
        };
    }

    @Get('me')
    @UseGuards(PrivyAuthGuard)
    me(@CurrentUser() user: AuthenticatedUser) {
        return { user };
    }

    @Get('wallets')
    @UseGuards(PrivyAuthGuard)
    async wallets(@CurrentUser() user: AuthenticatedUser) {
        const wallets = await this.authService.walletsForUser(user.id);
        return { wallets: wallets.map(serializeWallet) };
    }
}
