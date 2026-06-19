import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { AuthAuditEvent } from '../../database/models/auth-audit-event.model';
import { AppUser } from '../../database/models/app-user.model';
import { WalletLink } from '../../database/models/wallet-link.model';
import { SEQUELIZE } from '../../database/database.tokens';
import { PrivySessionDto, PrivyWalletDto } from './dto/privy-session.dto';
import { PrivyTokenService } from './privy-token.service';
import type { AuthenticatedUser } from './types';

@Injectable()
export class PrivyAuthService {
    constructor(
        @Inject(SEQUELIZE) private readonly sequelize: Sequelize,
        private readonly tokenService: PrivyTokenService,
    ) {}

    async authenticateToken(accessToken: string): Promise<AuthenticatedUser> {
        const claims = this.tokenService.verifyAccessToken(accessToken);
        const user = await AppUser.findOne({ where: { privyUserId: claims.sub } });

        if (!user || user.status !== 'active') {
            throw new UnauthorizedException('Authenticated Privy user is not registered');
        }

        return {
            id: user.id,
            privyUserId: user.privyUserId,
            sessionId: claims.sid,
            email: user.email,
            authMethod: user.authMethod,
        };
    }

    async upsertSession(
        accessToken: string,
        body: PrivySessionDto,
    ): Promise<{ user: AuthenticatedUser; wallets: WalletLink[] }> {
        const claims = this.tokenService.verifyAccessToken(accessToken);

        return this.sequelize.transaction(async () => {
            const [user] = await AppUser.findOrCreate({
                where: { privyUserId: claims.sub },
                defaults: {
                    privyUserId: claims.sub,
                    email: body.email || claims.email || null,
                    authMethod: body.authMethod || null,
                    status: 'active',
                },
            });

            await user.update({
                email: body.email || claims.email || user.email || null,
                authMethod: body.authMethod || user.authMethod || null,
                status: 'active',
            });

            if (body.wallet) {
                await this.upsertWallet(user.id, body.wallet);
            }

            await AuthAuditEvent.create({
                userId: user.id,
                privyUserId: user.privyUserId,
                eventType: 'privy.session.upserted',
                metadata: {
                    sessionId: claims.sid,
                    walletAddress: body.wallet?.address,
                    authMethod: body.authMethod,
                },
            });

            const wallets = await WalletLink.findAll({
                where: { userId: user.id },
                order: [
                    ['isPrimary', 'DESC'],
                    ['createdAt', 'ASC'],
                ],
            });

            return {
                user: {
                    id: user.id,
                    privyUserId: user.privyUserId,
                    sessionId: claims.sid,
                    email: user.email,
                    authMethod: user.authMethod,
                },
                wallets,
            };
        });
    }

    async walletsForUser(userId: string): Promise<WalletLink[]> {
        return WalletLink.findAll({
            where: { userId },
            order: [
                ['isPrimary', 'DESC'],
                ['createdAt', 'ASC'],
            ],
        });
    }

    private async upsertWallet(userId: string, wallet: PrivyWalletDto): Promise<void> {
        const address = wallet.address.toLowerCase();
        const [walletLink] = await WalletLink.findOrCreate({
            where: { userId, address },
            defaults: {
                userId,
                address,
                privyWalletId: wallet.privyWalletId || address,
                chainType: wallet.chainType || 'ethereum',
                walletType: wallet.walletType || 'embedded',
                isPrimary: wallet.isPrimary ?? true,
            },
        });

        await walletLink.update({
            privyWalletId: wallet.privyWalletId || walletLink.privyWalletId,
            chainType: wallet.chainType || walletLink.chainType,
            walletType: wallet.walletType || walletLink.walletType,
            isPrimary: wallet.isPrimary ?? walletLink.isPrimary,
        });
    }
}
