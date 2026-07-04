import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createServer } from 'http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { PrivyTokenService } from './privy-token.service';

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
    it('verifies a signed access token using the configured JWKS endpoint', async () => {
        const { publicKey, privateKey } = await generateKeyPair('ES256');
        const publicJwk = await exportJWK(publicKey);
        const server = createServer((_request, response) => {
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ keys: [{ ...publicJwk, alg: 'ES256', kid: 'key-1' }] }));
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') {
            server.close();
            throw new Error('test JWKS server did not bind to a TCP port');
        }

        try {
            const now = Math.floor(Date.now() / 1000);
            const token = await new SignJWT({ sid: 'session-1' })
                .setProtectedHeader({ alg: 'ES256', kid: 'key-1' })
                .setSubject('did:privy:user-1')
                .setIssuer('privy.io')
                .setAudience('privy-app-id')
                .setIssuedAt(now)
                .setExpirationTime(now + 3600)
                .sign(privateKey);
            const service = new PrivyTokenService(
                config({
                    NODE_ENV: 'test',
                    PRIVY_APP_ID: 'privy-app-id',
                    PRIVY_JWKS_URL: `http://127.0.0.1:${address.port}/jwks.json`,
                }),
            );

            const claims = await service.verifyAccessToken(token);

            expect(claims.sub).toBe('did:privy:user-1');
            expect(claims.sid).toBe('session-1');
        } finally {
            await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        }
    });

    it('accepts unsigned local tokens only when explicit dev mode is enabled', async () => {
        const service = new PrivyTokenService(
            config({
                NODE_ENV: 'development',
                PRIVY_APP_ID: 'privy-app-id',
                PRIVY_AUTH_DEV_ALLOW_UNSIGNED: 'true',
            }),
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
        );

        await expect(service.verifyAccessToken(unsignedToken({ aud: 'other-app' }))).rejects.toThrow(
            UnauthorizedException,
        );
    });

    it('requires a JWKS URL outside explicit dev unsigned mode', async () => {
        const service = new PrivyTokenService(
            config({
                NODE_ENV: 'production',
                PRIVY_APP_ID: 'privy-app-id',
            }),
        );

        await expect(service.verifyAccessToken(unsignedToken())).rejects.toThrow('Privy JWKS URL is not configured');
    });

    it('requires HTTPS JWKS in production', async () => {
        const service = new PrivyTokenService(
            config({
                NODE_ENV: 'production',
                PRIVY_APP_ID: 'privy-app-id',
                PRIVY_JWKS_URL: 'http://privy.example.test/.well-known/jwks.json',
            }),
        );

        await expect(service.verifyAccessToken(unsignedToken())).rejects.toThrow('Privy JWKS URL must use HTTPS');
    });
});
