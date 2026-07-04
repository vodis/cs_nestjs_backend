import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';

export type PrivyAccessTokenClaims = {
    sid: string;
    sub: string;
    iss: string;
    aud: string;
    iat: number;
    exp: number;
    email?: string;
};

@Injectable()
export class PrivyTokenService {
    private jwks?: ReturnType<typeof createRemoteJWKSet>;

    constructor(private readonly config: ConfigService) {}

    async verifyAccessToken(accessToken: string): Promise<PrivyAccessTokenClaims> {
        if (this.devUnsignedTokensAllowed()) {
            const claims = this.decodeToken(accessToken);
            this.validateClaims(claims);
            return claims;
        }

        const appId = this.requiredConfig('PRIVY_APP_ID', 'Privy app ID is not configured');
        const jwks = this.remoteJwks();

        try {
            const { payload } = await jwtVerify(accessToken, jwks, {
                algorithms: ['ES256'],
                issuer: 'privy.io',
                audience: appId,
            });
            const claims = payload as unknown as PrivyAccessTokenClaims;
            this.validateClaims(claims);
            return claims;
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            throw new UnauthorizedException('Invalid Privy access token');
        }
    }

    private decodeToken(accessToken: string): PrivyAccessTokenClaims {
        try {
            return decodeJwt(accessToken) as unknown as PrivyAccessTokenClaims;
        } catch {
            throw new UnauthorizedException('Invalid Privy access token');
        }
    }

    private remoteJwks(): ReturnType<typeof createRemoteJWKSet> {
        if (this.jwks) {
            return this.jwks;
        }

        const rawUrl = this.requiredConfig('PRIVY_JWKS_URL', 'Privy JWKS URL is not configured');
        let url: URL;
        try {
            url = new URL(rawUrl);
        } catch {
            throw new UnauthorizedException('Privy JWKS URL is invalid');
        }
        if (this.config.get<string>('NODE_ENV') === 'production' && url.protocol !== 'https:') {
            throw new UnauthorizedException('Privy JWKS URL must use HTTPS');
        }

        this.jwks = createRemoteJWKSet(url);
        return this.jwks;
    }

    private requiredConfig(key: string, message: string): string {
        const value = this.config.get<string>(key)?.trim();
        if (!value) {
            throw new UnauthorizedException(message);
        }
        return value;
    }

    private validateClaims(claims: PrivyAccessTokenClaims): void {
        const appId = this.requiredConfig('PRIVY_APP_ID', 'Privy app ID is not configured');
        if (claims.iss !== 'privy.io') {
            throw new UnauthorizedException('Invalid Privy token issuer');
        }
        if (claims.aud !== appId) {
            throw new UnauthorizedException('Invalid Privy token audience');
        }
        if (!claims.sub || !claims.sid) {
            throw new UnauthorizedException('Invalid Privy token subject');
        }
        if (typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000)) {
            throw new UnauthorizedException('Expired Privy access token');
        }
    }

    private devUnsignedTokensAllowed(): boolean {
        return (
            this.config.get<string>('NODE_ENV') !== 'production' &&
            this.config.get<string>('PRIVY_AUTH_DEV_ALLOW_UNSIGNED') === 'true'
        );
    }
}
