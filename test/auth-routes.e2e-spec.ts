import { INestApplication, RequestMethod, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthController } from '../src/api/auth/auth.controller';
import { PrivyAuthService } from '../src/api/auth/privy-auth.service';

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

    beforeEach(async () => {
        authService.authenticateToken.mockResolvedValue(user);
        authService.enablePasskey.mockResolvedValue({ user, wallets: [] });

        const moduleFixture: TestingModule = await Test.createTestingModule({
            controllers: [AuthController],
            providers: [{ provide: PrivyAuthService, useValue: authService }],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.enableVersioning({ type: VersioningType.URI });
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
});
