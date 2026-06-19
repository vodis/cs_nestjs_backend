import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrivyTokenService } from './privy-token.service';

function base64Url(value: unknown): string {
    return Buffer.from(JSON.stringify(value))
        .toString('base64url');
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
    it('accepts unsigned local tokens only when explicit dev mode is enabled', () => {
        const service = new PrivyTokenService(
            config({
                NODE_ENV: 'development',
                PRIVY_APP_ID: 'privy-app-id',
                PRIVY_AUTH_DEV_ALLOW_UNSIGNED: 'true',
            }),
        );

        const claims = service.verifyAccessToken(unsignedToken());

        expect(claims.sub).toBe('did:privy:user-1');
        expect(claims.sid).toBe('session-1');
    });

    it('rejects tokens for a different Privy app audience', () => {
        const service = new PrivyTokenService(
            config({
                NODE_ENV: 'development',
                PRIVY_APP_ID: 'privy-app-id',
                PRIVY_AUTH_DEV_ALLOW_UNSIGNED: 'true',
            }),
        );

        expect(() => service.verifyAccessToken(unsignedToken({ aud: 'other-app' }))).toThrow(
            UnauthorizedException,
        );
    });

    it('requires a verification key outside explicit dev unsigned mode', () => {
        const service = new PrivyTokenService(
            config({
                NODE_ENV: 'production',
                PRIVY_APP_ID: 'privy-app-id',
            }),
        );

        expect(() => service.verifyAccessToken(unsignedToken())).toThrow(UnauthorizedException);
    });
});
