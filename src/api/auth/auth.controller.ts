import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PrivySessionDto } from './dto/privy-session.dto';
import { BindWalletDto } from './dto/wallet-binding.dto';
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
    source: string;
    status: string;
    isPrimary: boolean;
    deletedAt?: Date | null;
}) {
    return {
        id: wallet.id,
        providerWalletId: wallet.privyWalletId,
        address: wallet.address,
        chainType: wallet.chainType,
        walletType: wallet.walletType,
        source: wallet.source === 'privy' ? 'provider' : wallet.source,
        status: wallet.status,
        isPrimary: wallet.isPrimary,
        deletedAt: wallet.deletedAt?.toISOString() ?? null,
    };
}

function serializeUser(user: AuthenticatedUser) {
    return {
        id: user.id,
        providerUserId: user.privyUserId,
        sessionId: user.sessionId,
        email: user.email,
        authMethod: user.authMethod,
    };
}

@Controller({ version: '1' })
export class AuthController {
    constructor(private readonly authService: PrivyAuthService) {}

    @Post('auth/privy/session')
    async upsertPrivySession(@Req() request: RequestWithCookies, @Body() body: PrivySessionDto) {
        const result = await this.authService.upsertSession(extractAccessToken(request), body);
        return {
            user: serializeUser(result.user),
            wallets: result.wallets.map(serializeWallet),
        };
    }

    @Get('me')
    @UseGuards(PrivyAuthGuard)
    me(@CurrentUser() user: AuthenticatedUser) {
        return { user: serializeUser(user) };
    }

    @Delete('me')
    @UseGuards(PrivyAuthGuard)
    async requestAccountDeletion(@CurrentUser() user: AuthenticatedUser) {
        const result = await this.authService.requestAccountDeletion(user);
        return {
            status: 'pending_deletion',
            deletionAvailableAt: result.deletionAvailableAt.toISOString(),
        };
    }

    @Get('wallets')
    @UseGuards(PrivyAuthGuard)
    async wallets(@CurrentUser() user: AuthenticatedUser) {
        const wallets = await this.authService.walletsForUser(user.id);
        return { wallets: wallets.map(serializeWallet) };
    }

    @Post('wallets')
    @UseGuards(PrivyAuthGuard)
    async bindWallet(@CurrentUser() user: AuthenticatedUser, @Body() body: BindWalletDto) {
        const wallet = await this.authService.bindWallet(user, body);
        return { wallet: serializeWallet(wallet) };
    }

    @Patch('wallets/:walletId/primary')
    @UseGuards(PrivyAuthGuard)
    async setPrimaryWallet(@CurrentUser() user: AuthenticatedUser, @Param('walletId') walletId: string) {
        const wallet = await this.authService.setPrimaryWallet(user, walletId);
        return { wallet: serializeWallet(wallet) };
    }

    @Delete('wallets/:walletId')
    @UseGuards(PrivyAuthGuard)
    async deleteWallet(@CurrentUser() user: AuthenticatedUser, @Param('walletId') walletId: string) {
        const result = await this.authService.deleteWallet(user, walletId);
        return {
            wallet: serializeWallet(result.wallet),
            promotedWallet: result.promotedWallet ? serializeWallet(result.promotedWallet) : null,
        };
    }
}
