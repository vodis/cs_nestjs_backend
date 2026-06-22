import { Sequelize } from 'sequelize-typescript';
import { AuthAuditEvent } from '../../database/models/auth-audit-event.model';
import { AppUser } from '../../database/models/app-user.model';
import { WalletLink } from '../../database/models/wallet-link.model';
import { PrivyAuthService } from './privy-auth.service';
import { PrivyTokenService } from './privy-token.service';

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

    beforeEach(async () => {
        sequelize = new Sequelize({
            dialect: 'sqlite',
            storage: ':memory:',
            logging: false,
            models: [AppUser, WalletLink, AuthAuditEvent],
        });
        await sequelize.sync({ force: true });
        tokens = tokenService();
        service = new PrivyAuthService(sequelize, tokens);
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

        const events = await AuthAuditEvent.findAll({ order: [['createdAt', 'ASC']] });
        expect(events.map((event) => event.eventType)).toEqual(['account.final_purge', 'account.signup']);
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
});
