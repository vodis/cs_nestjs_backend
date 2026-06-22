import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AuthAuditEvent } from '../../database/models/auth-audit-event.model';
import { AppUser } from '../../database/models/app-user.model';
import { WalletLink } from '../../database/models/wallet-link.model';
import { SEQUELIZE } from '../../database/database.tokens';
import { PrivySessionDto, PrivyWalletDto } from './dto/privy-session.dto';
import { PrivyTokenService } from './privy-token.service';
import type { AuthenticatedUser } from './types';

const SOFT_DELETE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

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

        return this.sequelize.transaction(async (transaction) => {
            const now = new Date();
            let user = await AppUser.findOne({ where: { privyUserId: claims.sub }, transaction });

            if (user?.status === 'deleted') {
                throw new ForbiddenException('Privy account is deleted');
            }

            if (user?.status === 'pending_deletion') {
                if (this.deletionWindowExpired(user, now)) {
                    await this.finalizeDeletedUser(user, now, transaction);
                    user = null;
                } else {
                    await this.restorePendingDeletion(user, now, transaction);
                }
            }

            const [activeUser, created] = await AppUser.findOrCreate({
                where: { privyUserId: claims.sub },
                defaults: {
                    privyUserId: claims.sub,
                    email: body.email || claims.email || null,
                    authMethod: body.authMethod || null,
                    status: 'active',
                },
                transaction,
            });
            user = activeUser;

            await user.update(
                {
                    email: body.email || claims.email || user.email || null,
                    authMethod: body.authMethod || user.authMethod || null,
                    status: 'active',
                    deletedAt: null,
                    deletionRequestedAt: null,
                    deletionAvailableAt: null,
                },
                { transaction },
            );

            if (body.wallet) {
                await this.upsertWallet(user.id, body.wallet, transaction);
            }

            await AuthAuditEvent.create(
                {
                    userId: user.id,
                    privyUserId: user.privyUserId,
                    eventType: created ? 'account.signup' : 'account.login',
                    metadata: {
                        sessionId: claims.sid,
                        walletAddress: body.wallet?.address,
                        authMethod: body.authMethod,
                    },
                },
                { transaction },
            );

            const wallets = await WalletLink.findAll({
                where: { userId: user.id },
                order: [
                    ['isPrimary', 'DESC'],
                    ['createdAt', 'ASC'],
                ],
                transaction,
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

    async requestAccountDeletion(user: AuthenticatedUser): Promise<{ deletionAvailableAt: Date }> {
        return this.sequelize.transaction(async (transaction) => {
            const appUser = await AppUser.findByPk(user.id, { transaction });
            if (!appUser || appUser.status !== 'active') {
                throw new UnauthorizedException('Authenticated Privy user is not active');
            }

            const now = new Date();
            const deletionAvailableAt = new Date(now.getTime() + SOFT_DELETE_RETENTION_MS);
            await appUser.update(
                {
                    status: 'pending_deletion',
                    deletionRequestedAt: now,
                    deletionAvailableAt,
                    deletedAt: null,
                },
                { transaction },
            );

            await AuthAuditEvent.create(
                {
                    userId: appUser.id,
                    privyUserId: appUser.privyUserId,
                    eventType: 'account.delete_requested',
                    metadata: {
                        deletionAvailableAt: deletionAvailableAt.toISOString(),
                    },
                },
                { transaction },
            );

            return { deletionAvailableAt };
        });
    }

    async purgeDeletionEligibleAccounts(now = new Date()): Promise<number> {
        const users = await AppUser.findAll({
            where: {
                status: 'pending_deletion',
                deletionAvailableAt: {
                    [Op.lte]: now,
                },
            },
        });

        for (const user of users) {
            await this.sequelize.transaction(async (transaction) => {
                await this.finalizeDeletedUser(user, now, transaction);
            });
        }

        return users.length;
    }

    private async upsertWallet(userId: string, wallet: PrivyWalletDto, transaction: Transaction): Promise<void> {
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
            transaction,
        });

        await walletLink.update(
            {
                privyWalletId: wallet.privyWalletId || walletLink.privyWalletId,
                chainType: wallet.chainType || walletLink.chainType,
                walletType: wallet.walletType || walletLink.walletType,
                isPrimary: wallet.isPrimary ?? walletLink.isPrimary,
            },
            { transaction },
        );
    }

    private deletionWindowExpired(user: AppUser, now: Date): boolean {
        return Boolean(user.deletionAvailableAt && user.deletionAvailableAt.getTime() <= now.getTime());
    }

    private async restorePendingDeletion(user: AppUser, now: Date, transaction: Transaction): Promise<void> {
        await user.update(
            {
                status: 'active',
                deletedAt: null,
                deletionRequestedAt: null,
                deletionAvailableAt: null,
            },
            { transaction },
        );

        await AuthAuditEvent.create(
            {
                userId: user.id,
                privyUserId: user.privyUserId,
                eventType: 'account.restore',
                metadata: {
                    restoredAt: now.toISOString(),
                },
            },
            { transaction },
        );
    }

    private async finalizeDeletedUser(user: AppUser, now: Date, transaction: Transaction): Promise<void> {
        const previousPrivyUserId = user.privyUserId;
        await user.update(
            {
                privyUserId: `deleted:${user.id}:${previousPrivyUserId}`,
                status: 'deleted',
                deletedAt: now,
            },
            { transaction },
        );

        await AuthAuditEvent.create(
            {
                userId: user.id,
                privyUserId: previousPrivyUserId,
                eventType: 'account.final_purge',
                metadata: {
                    deletedAt: now.toISOString(),
                },
            },
            { transaction },
        );
    }
}
