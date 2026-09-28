import { INestApplication, RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthController } from '../src/api/auth/auth.controller';
import { PrivyAuthService } from '../src/api/auth/privy-auth.service';
import { WalletLinkService } from '../src/api/auth/wallet-link.service';

const user = {
    id: 'user-1',
    privyUserId: 'did:privy:user-1',
    sessionId: 'session-1',
    email: 'user@example.test',
    authMethod: 'passkey',
    passkeyEnabled: true,
};

describe('Auth routes (e2e)', () => {
    let app: INestApplication;
    const authService = {
        authenticateToken: jest.fn(),
        enablePasskey: jest.fn(),
    };
    const nearWalletLink = {
        createChallenge: jest.fn(),
        verifyChallenge: jest.fn(),
    };

    beforeEach(async () => {
        authService.authenticateToken.mockResolvedValue(user);
        authService.enablePasskey.mockResolvedValue({ user, wallets: [] });

        const moduleFixture: TestingModule = await Test.createTestingModule({
            controllers: [AuthController],
            providers: [
                { provide: PrivyAuthService, useValue: authService },
                { provide: WalletLinkService, useValue: nearWalletLink },
            ],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.enableVersioning({ type: VersioningType.URI });
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        app.setGlobalPrefix('/api', {
            exclude: [{ path: '/health', method: RequestMethod.GET }],
        });
        await app.init();
    });

    afterEach(async () => {
        jest.clearAllMocks();
        await app?.close();
    });

    it('routes POST /api/v1/me/passkey to the passkey marker endpoint', async () => {
        await request(app.getHttpServer())
            .post('/api/v1/me/passkey')
            .set('Authorization', 'Bearer privy-token')
            .expect(201)
            .expect({
                user: {
                    id: 'user-1',
                    providerUserId: 'did:privy:user-1',
                    sessionId: 'session-1',
                    email: 'user@example.test',
                    authMethod: 'passkey',
                    passkeyEnabled: true,
                },
                wallets: [],
            });

        expect(authService.authenticateToken).toHaveBeenCalledWith('privy-token');
        expect(authService.enablePasskey).toHaveBeenCalledWith(user);
    });

    it('requires authentication for a NEAR wallet challenge', async () => {
        await request(app.getHttpServer())
            .post('/api/v1/wallets/link/challenge')
            .send({ chainType: 'near', address: 'alice.near' })
            .expect(401);
        expect(nearWalletLink.createChallenge).not.toHaveBeenCalled();
    });

    it('routes an authenticated NEAR wallet challenge to the ownership service', async () => {
        const challenge = {
            challengeId: 'challenge-1',
            message: 'Link wallet',
            recipient: 'craftscript.com',
            nonce: 'nonce',
        };
        nearWalletLink.createChallenge.mockResolvedValue(challenge);
        await request(app.getHttpServer())
            .post('/api/v1/wallets/link/challenge')
            .set('Authorization', 'Bearer privy-token')
            .send({ chainType: 'near', address: 'alice.near' })
            .expect(201)
            .expect(challenge);
        expect(nearWalletLink.createChallenge).toHaveBeenCalledWith(user, 'near', 'alice.near');
    });

    it('rejects verification without a proof object', async () => {
        await request(app.getHttpServer())
            .post('/api/v1/wallets/link/verify')
            .set('Authorization', 'Bearer privy-token')
            .send({ challengeId: '00000000-0000-4000-8000-000000000001', chainType: 'near' })
            .expect(400);
        expect(nearWalletLink.verifyChallenge).not.toHaveBeenCalled();
    });
});
