import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrivyAccessTokenVerifier, PrivyTokenService } from './privy-token.service';

function base64Url(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function unsignedToken(overrides: Record<string, unknown> = {}): string {
    const now = Math.floor(Date.now() / 1000);
    return [
        base64Url({ alg: 'ES256', typ: 'JWT' }),
        base64Url({
            sid: 'session-1',
            sub: 'did:privy:user-1',
            iss: 'privy.io',
            aud: 'privy-app-id',
            iat: now,
            exp: now + 3600,
            ...overrides,
        }),
        'signature',
    ].join('.');
}

function config(values: Record<string, string>): ConfigService {
    return {
        get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
}

describe('PrivyTokenService', () => {
    let verifyAccessTokenMock: jest.MockedFunction<PrivyAccessTokenVerifier>;

    beforeEach(() => {
        verifyAccessTokenMock = jest.fn();
    });

    it('accepts unsigned local tokens only when explicit dev mode is enabled', async () => {
        const service = new PrivyTokenService(
            config({
                NODE_ENV: 'development',
                PRIVY_APP_ID: 'privy-app-id',
                PRIVY_AUTH_DEV_ALLOW_UNSIGNED: 'true',
            }),
            verifyAccessTokenMock,
        );

        const claims = await service.verifyAccessToken(unsignedToken());

        expect(claims.sub).toBe('did:privy:user-1');
        expect(claims.sid).toBe('session-1');
    });

    it('rejects tokens for a different Privy app audience', async () => {
        const service = new PrivyTokenService(
            config({
                NODE_ENV: 'development',
                PRIVY_APP_ID: 'privy-app-id',
                PRIVY_AUTH_DEV_ALLOW_UNSIGNED: 'true',
            }),
            verifyAccessTokenMock,
        );

        await expect(service.verifyAccessToken(unsignedToken({ aud: 'other-app' }))).rejects.toThrow(
            UnauthorizedException,
        );
    });

    it('requires a verification key outside explicit dev unsigned mode', async () => {
        const service = new PrivyTokenService(
            config({
                NODE_ENV: 'production',
                PRIVY_APP_ID: 'privy-app-id',
            }),
            verifyAccessTokenMock,
        );

        await expect(service.verifyAccessToken(unsignedToken())).rejects.toThrow(UnauthorizedException);
    });

    it('verifies production access tokens through the official Privy SDK', async () => {
        verifyAccessTokenMock.mockResolvedValue({
            app_id: 'privy-app-id',
            issuer: 'privy.io',
            issued_at: 100,
            expiration: 200,
            session_id: 'session-1',
            user_id: 'did:privy:user-1',
        });
        const service = new PrivyTokenService(
            config({
                NODE_ENV: 'production',
                PRIVY_APP_ID: 'privy-app-id',
                PRIVY_VERIFICATION_KEY: 'public\\nkey',
            }),
            verifyAccessTokenMock,
        );

        await expect(service.verifyAccessToken('signed-token')).resolves.toEqual({
            sid: 'session-1',
            sub: 'did:privy:user-1',
            iss: 'privy.io',
            aud: 'privy-app-id',
            iat: 100,
            exp: 200,
        });
        expect(verifyAccessTokenMock).toHaveBeenCalledWith({
            access_token: 'signed-token',
            app_id: 'privy-app-id',
            verification_key: 'public\nkey',
        });
    });

    it('maps SDK verification failures to the backend auth boundary', async () => {
        verifyAccessTokenMock.mockRejectedValue(new Error('invalid token'));
        const service = new PrivyTokenService(
            config({
                NODE_ENV: 'production',
                PRIVY_APP_ID: 'privy-app-id',
                PRIVY_VERIFICATION_KEY: 'verification-key',
            }),
            verifyAccessTokenMock,
        );

        await expect(service.verifyAccessToken('invalid-token')).rejects.toThrow(UnauthorizedException);
    });
});
