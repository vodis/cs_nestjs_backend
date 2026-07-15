import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AuthAuditEvent } from '../../database/models/auth-audit-event.model';
import { AppUser } from '../../database/models/app-user.model';
import { WalletLink } from '../../database/models/wallet-link.model';
import { SEQUELIZE } from '../../database/database.tokens';
import { ProductEventsService } from '../product-events/product-events.service';
import { PrivySessionDto, PrivyWalletDto } from './dto/privy-session.dto';
import { BindWalletDto, WalletSource, WalletType } from './dto/wallet-binding.dto';
import { PrivyTokenService } from './privy-token.service';
import { PrivyWalletOwnershipService } from './privy-wallet-ownership.service';
import type { AuthenticatedUser } from './types';

const SOFT_DELETE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class PrivyAuthService {
    constructor(
        @Inject(SEQUELIZE) private readonly sequelize: Sequelize,
        private readonly tokenService: PrivyTokenService,
        private readonly walletOwnership: PrivyWalletOwnershipService,
        private readonly productEvents: ProductEventsService,
    ) {}

    async authenticateToken(accessToken: string): Promise<AuthenticatedUser> {
        const claims = await this.tokenService.verifyAccessToken(accessToken);
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
            passkeyEnabled: user.passkeyEnabled,
        };
    }

    async upsertSession(
        accessToken: string,
        body: PrivySessionDto,
    ): Promise<{ user: AuthenticatedUser; wallets: WalletLink[] }> {
        const claims = await this.tokenService.verifyAccessToken(accessToken);
        if (body.wallet) {
            await this.walletOwnership.assertOwned(claims.sub, body.wallet);
        }

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
                    passkeyEnabled: false,
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
                    passkeyEnabled: user.passkeyEnabled,
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
            await this.productEvents.recordBestEffort({
                eventName: created ? 'account.created' : 'account.login',
                source: 'backend',
                status: 'succeeded',
                userId: user.id,
                sessionId: claims.sid,
                metadata: {
                    authMethod: body.authMethod,
                    walletAttached: Boolean(body.wallet),
                },
            });

            const wallets = await WalletLink.findAll({
                where: { userId: user.id, status: 'active' },
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
                    passkeyEnabled: user.passkeyEnabled,
                },
                wallets,
            };
        });
    }

    async enablePasskey(user: AuthenticatedUser): Promise<{ user: AuthenticatedUser; wallets: WalletLink[] }> {
        return this.sequelize.transaction(async (transaction) => {
            const appUser = await AppUser.findByPk(user.id, { transaction });
            if (!appUser || appUser.status !== 'active') {
                throw new UnauthorizedException('Authenticated Privy user is not active');
            }

            await appUser.update({ passkeyEnabled: true }, { transaction });
            await AuthAuditEvent.create(
                {
                    userId: appUser.id,
                    privyUserId: appUser.privyUserId,
                    eventType: 'account.passkey_enabled',
                    metadata: {
                        sessionId: user.sessionId,
                    },
                },
                { transaction },
            );
            await this.productEvents.recordBestEffort({
                eventName: 'account.passkey.enabled',
                source: 'backend',
                status: 'succeeded',
                userId: appUser.id,
                sessionId: user.sessionId,
            });

            const wallets = await WalletLink.findAll({
                where: { userId: appUser.id, status: 'active' },
                order: [
                    ['isPrimary', 'DESC'],
                    ['createdAt', 'ASC'],
                ],
                transaction,
            });

            return {
                user: {
                    id: appUser.id,
                    privyUserId: appUser.privyUserId,
                    sessionId: user.sessionId,
                    email: appUser.email,
                    authMethod: appUser.authMethod,
                    passkeyEnabled: appUser.passkeyEnabled,
                },
                wallets,
            };
        });
    }

    async walletsForUser(userId: string): Promise<WalletLink[]> {
        return WalletLink.findAll({
            where: { userId, status: 'active' },
            order: [
                ['isPrimary', 'DESC'],
                ['createdAt', 'ASC'],
            ],
        });
    }

    async bindWallet(user: AuthenticatedUser, body: BindWalletDto): Promise<WalletLink> {
        await this.walletOwnership.assertOwned(user.privyUserId, body);
        return this.sequelize.transaction(async (transaction) => {
            await this.assertActiveUser(user.id, transaction);

            const wallet = await this.upsertWallet(user.id, body, transaction);
            await AuthAuditEvent.create(
                {
                    userId: user.id,
                    privyUserId: user.privyUserId,
                    eventType: 'wallet.bind',
                    metadata: {
                        walletId: wallet.id,
                        address: wallet.address,
                        chainType: wallet.chainType,
                        walletType: wallet.walletType,
                        source: wallet.source,
                    },
                },
                { transaction },
            );
            await this.productEvents.recordBestEffort({
                eventName: 'wallet.bind',
                source: 'backend',
                status: 'succeeded',
                userId: user.id,
                metadata: {
                    chainType: wallet.chainType,
                    walletType: wallet.walletType,
                    source: wallet.source,
                },
            });

            return wallet;
        });
    }

    async setPrimaryWallet(user: AuthenticatedUser, walletId: string): Promise<WalletLink> {
        return this.sequelize.transaction(async (transaction) => {
            await this.assertActiveUser(user.id, transaction);
            const wallet = await this.findActiveWallet(user.id, walletId, transaction);

            await this.markPrimaryWallet(user.id, wallet.id, transaction);
            await AuthAuditEvent.create(
                {
                    userId: user.id,
                    privyUserId: user.privyUserId,
                    eventType: 'wallet.set_primary',
                    metadata: {
                        walletId: wallet.id,
                        address: wallet.address,
                    },
                },
                { transaction },
            );

            await wallet.reload({ transaction });
            return wallet;
        });
    }

    async deleteWallet(
        user: AuthenticatedUser,
        walletId: string,
    ): Promise<{ wallet: WalletLink; promotedWallet?: WalletLink }> {
        return this.sequelize.transaction(async (transaction) => {
            await this.assertActiveUser(user.id, transaction);
            const wallet = await this.findActiveWallet(user.id, walletId, transaction);
            const wasPrimary = wallet.isPrimary;
            const now = new Date();

            await wallet.update(
                {
                    status: 'deleted',
                    deletedAt: now,
                    isPrimary: false,
                },
                { transaction },
            );

            let promotedWallet: WalletLink | undefined;
            if (wasPrimary) {
                promotedWallet = await WalletLink.findOne({
                    where: { userId: user.id, status: 'active' },
                    order: [['createdAt', 'ASC']],
                    transaction,
                });

                if (promotedWallet) {
                    await this.markPrimaryWallet(user.id, promotedWallet.id, transaction);
                    await promotedWallet.reload({ transaction });
                }
            }

            await AuthAuditEvent.create(
                {
                    userId: user.id,
                    privyUserId: user.privyUserId,
                    eventType: 'wallet.delete',
                    metadata: {
                        walletId: wallet.id,
                        address: wallet.address,
                        deletedAt: now.toISOString(),
                        promotedWalletId: promotedWallet?.id,
                    },
                },
                { transaction },
            );

            return { wallet, promotedWallet };
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

    private async upsertWallet(
        userId: string,
        wallet: PrivyWalletDto | BindWalletDto,
        transaction: Transaction,
    ): Promise<WalletLink> {
        const chainType = wallet.chainType || 'ethereum';
        const walletType = wallet.walletType || 'embedded';
        const source = this.resolveWalletSource(walletType, wallet.source);
        const address = this.normalizeWalletAddress(wallet.address, chainType);
        const [walletLink] = await WalletLink.findOrCreate({
            where: { userId, address },
            defaults: {
                userId,
                address,
                privyWalletId: wallet.privyWalletId || address,
                chainType,
                walletType,
                source,
                status: 'active',
                deletedAt: null,
                isPrimary: wallet.isPrimary ?? true,
            },
            transaction,
        });

        await walletLink.update(
            {
                privyWalletId: wallet.privyWalletId || walletLink.privyWalletId,
                chainType,
                walletType,
                source,
                status: 'active',
                deletedAt: null,
                isPrimary: wallet.isPrimary ?? walletLink.isPrimary,
            },
            { transaction },
        );

        if (walletLink.isPrimary) {
            await this.markPrimaryWallet(userId, walletLink.id, transaction);
            await walletLink.reload({ transaction });
        }

        return walletLink;
    }

    private async assertActiveUser(userId: string, transaction: Transaction): Promise<void> {
        const appUser = await AppUser.findByPk(userId, { transaction });
        if (!appUser || appUser.status !== 'active') {
            throw new UnauthorizedException('Authenticated Privy user is not active');
        }
    }

    private async findActiveWallet(userId: string, walletId: string, transaction: Transaction): Promise<WalletLink> {
        const wallet = await WalletLink.findOne({
            where: {
                id: walletId,
                userId,
                status: 'active',
            },
            transaction,
        });

        if (!wallet) {
            throw new NotFoundException('Wallet link not found');
        }

        return wallet;
    }

    private async markPrimaryWallet(userId: string, walletId: string, transaction: Transaction): Promise<void> {
        await WalletLink.update({ isPrimary: false }, { where: { userId, status: 'active' }, transaction });
        await WalletLink.update(
            { isPrimary: true },
            { where: { id: walletId, userId, status: 'active' }, transaction },
        );
    }

    private normalizeWalletAddress(address: string, chainType: string): string {
        const value = address.trim();
        if (!value) {
            throw new BadRequestException('Wallet address is required');
        }

        if (chainType === 'ethereum' || chainType === 'evm') {
            if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
                throw new BadRequestException('EVM wallet address must be a 20-byte hex address');
            }
            return value.toLowerCase();
        }

        if (chainType === 'near') {
            const normalized = value.toLowerCase();
            if (!/^(([a-z0-9]+[-_])*[a-z0-9]+[.])*([a-z0-9]+[-_])*[a-z0-9]+$/.test(normalized)) {
                throw new BadRequestException('NEAR wallet address must be a valid account id');
            }
            return normalized;
        }

        throw new BadRequestException('Unsupported wallet chain type');
    }

    private resolveWalletSource(walletType: WalletType, source?: WalletSource): WalletSource {
        if (source) {
            return source;
        }

        if (walletType === 'embedded') {
            return 'privy';
        }

        throw new BadRequestException('External wallet source is required');
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
