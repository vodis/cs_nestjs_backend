import { Sequelize } from 'sequelize-typescript';
import { AuthAuditEvent } from '../../database/models/auth-audit-event.model';
import { AppUser } from '../../database/models/app-user.model';
import { WalletLink } from '../../database/models/wallet-link.model';
import { PrivyAuthService } from './privy-auth.service';
import { PrivyTokenService } from './privy-token.service';
import { PrivyWalletOwnershipService } from './privy-wallet-ownership.service';
import { ProductEventsService } from '../product-events/product-events.service';

function tokenService() {
    return {
        verifyAccessToken: jest.fn(() => ({
            sub: 'did:privy:user-1',
            sid: 'session-1',
            email: 'user@example.com',
        })),
    } as unknown as jest.Mocked<PrivyTokenService>;
}

describe('PrivyAuthService account lifecycle', () => {
    let sequelize: Sequelize;
    let service: PrivyAuthService;
    let tokens: jest.Mocked<PrivyTokenService>;
    let walletOwnership: jest.Mocked<PrivyWalletOwnershipService>;
    let productEvents: jest.Mocked<ProductEventsService>;

    beforeEach(async () => {
        sequelize = new Sequelize({
            dialect: 'sqlite',
            storage: ':memory:',
            logging: false,
            models: [AppUser, WalletLink, AuthAuditEvent],
        });
        await sequelize.sync({ force: true });
        tokens = tokenService();
        walletOwnership = {
            assertOwned: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<PrivyWalletOwnershipService>;
        productEvents = {
            recordBestEffort: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<ProductEventsService>;
        service = new PrivyAuthService(sequelize, tokens, walletOwnership, productEvents);
    });

    afterEach(async () => {
        await sequelize.close();
    });

    it('marks active accounts as pending deletion for 30 days', async () => {
        const user = await AppUser.create({
            privyUserId: 'did:privy:user-1',
            status: 'active',
        });

        const result = await service.requestAccountDeletion({
            id: user.id,
            privyUserId: user.privyUserId,
            sessionId: 'session-1',
            passkeyEnabled: false,
        });

        await user.reload();
        expect(user.status).toBe('pending_deletion');
        expect(user.deletionRequestedAt).toBeInstanceOf(Date);
        expect(user.deletionAvailableAt?.toISOString()).toBe(result.deletionAvailableAt.toISOString());
        expect(result.deletionAvailableAt.getTime() - user.deletionRequestedAt!.getTime()).toBe(
            30 * 24 * 60 * 60 * 1000,
        );

        const event = await AuthAuditEvent.findOne({ where: { eventType: 'account.delete_requested' } });
        expect(event?.userId).toBe(user.id);
    });

    it('restores pending-deletion accounts when the user signs in before the retention window expires', async () => {
        const now = Date.now();
        const user = await AppUser.create({
            privyUserId: 'did:privy:user-1',
            status: 'pending_deletion',
            deletionRequestedAt: new Date(now - 24 * 60 * 60 * 1000),
            deletionAvailableAt: new Date(now + 29 * 24 * 60 * 60 * 1000),
        });

        const result = await service.upsertSession('token', { authMethod: 'email' });

        await user.reload();
        expect(result.user.id).toBe(user.id);
        expect(result.user.passkeyEnabled).toBe(false);
        expect(user.status).toBe('active');
        expect(user.deletionRequestedAt).toBeNull();
        expect(user.deletionAvailableAt).toBeNull();

        const events = await AuthAuditEvent.findAll({ order: [['createdAt', 'ASC']] });
        expect(events.map((event) => event.eventType)).toEqual(['account.restore', 'account.login']);
    });

    it('finalizes expired pending-deletion accounts before recreating the Privy subject', async () => {
        const now = Date.now();
        const oldUser = await AppUser.create({
            privyUserId: 'did:privy:user-1',
            status: 'pending_deletion',
            deletionRequestedAt: new Date(now - 31 * 24 * 60 * 60 * 1000),
            deletionAvailableAt: new Date(now - 24 * 60 * 60 * 1000),
        });

        const result = await service.upsertSession('token', { authMethod: 'email' });

        await oldUser.reload();
        expect(oldUser.status).toBe('deleted');
        expect(oldUser.deletedAt).toBeInstanceOf(Date);
        expect(oldUser.privyUserId).toBe(`deleted:${oldUser.id}:did:privy:user-1`);
        expect(result.user.id).not.toBe(oldUser.id);
        expect(result.user.privyUserId).toBe('did:privy:user-1');
        expect(result.user.passkeyEnabled).toBe(false);

        const events = await AuthAuditEvent.findAll({ order: [['createdAt', 'ASC']] });
        expect(events.map((event) => event.eventType)).toEqual(['account.final_purge', 'account.signup']);
    });

    it('preserves passkey-enabled state when the user signs in again', async () => {
        const user = await AppUser.create({
            privyUserId: 'did:privy:user-1',
            status: 'active',
            passkeyEnabled: true,
        });

        const result = await service.upsertSession('token', { authMethod: 'email' });

        await user.reload();
        expect(result.user.id).toBe(user.id);
        expect(result.user.passkeyEnabled).toBe(true);
        expect(user.passkeyEnabled).toBe(true);
    });

    it('marks passkey enabled for an active account and records an audit event', async () => {
        const user = await AppUser.create({
            privyUserId: 'did:privy:user-1',
            status: 'active',
        });

        const result = await service.enablePasskey({
            id: user.id,
            privyUserId: user.privyUserId,
            sessionId: 'session-1',
            passkeyEnabled: false,
        });

        await user.reload();
        expect(result.user.passkeyEnabled).toBe(true);
        expect(user.passkeyEnabled).toBe(true);

        const event = await AuthAuditEvent.findOne({ where: { eventType: 'account.passkey_enabled' } });
        expect(event?.userId).toBe(user.id);
        expect(event?.metadata).toMatchObject({ sessionId: 'session-1' });
    });

    it('purges pending-deletion accounts whose retention window has elapsed', async () => {
        const now = new Date('2026-06-22T12:00:00Z');
        const eligible = await AppUser.create({
            privyUserId: 'did:privy:eligible',
            status: 'pending_deletion',
            deletionRequestedAt: new Date('2026-05-01T12:00:00Z'),
            deletionAvailableAt: new Date('2026-05-31T12:00:00Z'),
        });
        const retained = await AppUser.create({
            privyUserId: 'did:privy:retained',
            status: 'pending_deletion',
            deletionRequestedAt: new Date('2026-06-01T12:00:00Z'),
            deletionAvailableAt: new Date('2026-07-01T12:00:00Z'),
        });

        await expect(service.purgeDeletionEligibleAccounts(now)).resolves.toBe(1);

        await eligible.reload();
        await retained.reload();
        expect(eligible.status).toBe('deleted');
        expect(retained.status).toBe('pending_deletion');
    });

    it('binds a wallet to the active account and records an audit event', async () => {
        const user = await AppUser.create({
            privyUserId: 'did:privy:user-1',
            status: 'active',
        });

        const wallet = await service.bindWallet(
            {
                id: user.id,
                privyUserId: user.privyUserId,
                sessionId: 'session-1',
                passkeyEnabled: false,
            },
            {
                address: '0xA000000000000000000000000000000000000001',
                chainType: 'ethereum',
                walletType: 'embedded',
                source: 'privy',
            },
        );

        expect(wallet.address).toBe('0xa000000000000000000000000000000000000001');
        expect(wallet.status).toBe('active');
        expect(wallet.isPrimary).toBe(true);
        expect(walletOwnership.assertOwned).toHaveBeenCalledWith(
            'did:privy:user-1',
            expect.objectContaining({ address: '0xA000000000000000000000000000000000000001' }),
        );

        const event = await AuthAuditEvent.findOne({ where: { eventType: 'wallet.bind' } });
        expect(event?.userId).toBe(user.id);
        expect(event?.metadata).toMatchObject({
            walletId: wallet.id,
            address: wallet.address,
        });
    });

    it('requires an explicit supported source for external wallet binding', async () => {
        const user = await AppUser.create({
            privyUserId: 'did:privy:user-1',
            status: 'active',
        });

        await expect(
            service.bindWallet(
                {
                    id: user.id,
                    privyUserId: user.privyUserId,
                    sessionId: 'session-1',
                    passkeyEnabled: false,
                },
                {
                    address: '0xA000000000000000000000000000000000000001',
                    chainType: 'ethereum',
                    walletType: 'external',
                },
            ),
        ).rejects.toThrow('External wallet source is required');
    });

    it('switches the primary wallet without changing wallet ownership', async () => {
        const user = await AppUser.create({
            privyUserId: 'did:privy:user-1',
            status: 'active',
        });
        const first = await WalletLink.create({
            userId: user.id,
            privyWalletId: 'first',
            address: '0xa000000000000000000000000000000000000001',
            chainType: 'ethereum',
            walletType: 'embedded',
            source: 'privy',
            status: 'active',
            isPrimary: true,
        });
        const second = await WalletLink.create({
            userId: user.id,
            privyWalletId: 'second',
            address: '0xa000000000000000000000000000000000000002',
            chainType: 'ethereum',
            walletType: 'external',
            source: 'walletconnect',
            status: 'active',
            isPrimary: false,
        });

        const selected = await service.setPrimaryWallet(
            {
                id: user.id,
                privyUserId: user.privyUserId,
                sessionId: 'session-1',
                passkeyEnabled: false,
            },
            second.id,
        );

        await first.reload();
        await second.reload();
        expect(selected.id).toBe(second.id);
        expect(first.isPrimary).toBe(false);
        expect(second.isPrimary).toBe(true);
    });

    it('soft-deletes a primary wallet and promotes the oldest remaining active wallet', async () => {
        const user = await AppUser.create({
            privyUserId: 'did:privy:user-1',
            status: 'active',
        });
        const first = await WalletLink.create({
            userId: user.id,
            privyWalletId: 'first',
            address: '0xa000000000000000000000000000000000000001',
            chainType: 'ethereum',
            walletType: 'embedded',
            source: 'privy',
            status: 'active',
            isPrimary: true,
        });
        const second = await WalletLink.create({
            userId: user.id,
            privyWalletId: 'second',
            address: '0xa000000000000000000000000000000000000002',
            chainType: 'ethereum',
            walletType: 'external',
            source: 'walletconnect',
            status: 'active',
            isPrimary: false,
        });

        const result = await service.deleteWallet(
            {
                id: user.id,
                privyUserId: user.privyUserId,
                sessionId: 'session-1',
                passkeyEnabled: false,
            },
            first.id,
        );

        await first.reload();
        await second.reload();
        const visibleWallets = await service.walletsForUser(user.id);

        expect(result.wallet.id).toBe(first.id);
        expect(result.promotedWallet?.id).toBe(second.id);
        expect(first.status).toBe('deleted');
        expect(first.deletedAt).toBeInstanceOf(Date);
        expect(first.isPrimary).toBe(false);
        expect(second.isPrimary).toBe(true);
        expect(visibleWallets.map((wallet) => wallet.id)).toEqual([second.id]);
    });

    it('reactivates a soft-deleted wallet link when the same address is rebound', async () => {
        const user = await AppUser.create({
            privyUserId: 'did:privy:user-1',
            status: 'active',
        });
        const deleted = await WalletLink.create({
            userId: user.id,
            privyWalletId: 'first',
            address: '0xa000000000000000000000000000000000000001',
            chainType: 'ethereum',
            walletType: 'embedded',
            source: 'privy',
            status: 'deleted',
            isPrimary: false,
            deletedAt: new Date('2026-06-22T12:00:00Z'),
        });

        const rebound = await service.bindWallet(
            {
                id: user.id,
                privyUserId: user.privyUserId,
                sessionId: 'session-1',
                passkeyEnabled: false,
            },
            {
                address: '0xA000000000000000000000000000000000000001',
                chainType: 'ethereum',
                walletType: 'embedded',
                isPrimary: true,
            },
        );

        await deleted.reload();
        expect(rebound.id).toBe(deleted.id);
        expect(deleted.status).toBe('active');
        expect(deleted.deletedAt).toBeNull();
        expect(deleted.isPrimary).toBe(true);
    });
});
