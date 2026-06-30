import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { VerifyAccessTokenInput, VerifyAccessTokenResponse } from '@privy-io/node';

export const PRIVY_ACCESS_TOKEN_VERIFIER = Symbol('PRIVY_ACCESS_TOKEN_VERIFIER');

export type PrivyAccessTokenVerifier = (input: VerifyAccessTokenInput) => Promise<VerifyAccessTokenResponse>;

type PrivyNodeSdk = typeof import('@privy-io/node');

const importPrivyNodeSdk = new Function('return import("@privy-io/node")') as () => Promise<PrivyNodeSdk>;

export const verifyWithPrivyNodeSdk: PrivyAccessTokenVerifier = async (input) => {
    const sdk = await importPrivyNodeSdk();
    return sdk.verifyAccessToken(input);
};

export type PrivyAccessTokenClaims = {
    sid: string;
    sub: string;
    iss: string;
    aud: string;
    iat: number;
    exp: number;
    email?: string;
};

function base64UrlDecode(value: string): Buffer {
    const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
    return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function decodeJsonPart<T>(part: string): T {
    return JSON.parse(base64UrlDecode(part).toString('utf8')) as T;
}

@Injectable()
export class PrivyTokenService {
    constructor(
        private readonly config: ConfigService,
        @Inject(PRIVY_ACCESS_TOKEN_VERIFIER)
        private readonly verifyPrivyAccessToken: PrivyAccessTokenVerifier,
    ) {}

    async verifyAccessToken(accessToken: string): Promise<PrivyAccessTokenClaims> {
        if (this.devUnsignedTokensAllowed()) {
            const claims = this.decodeDevelopmentToken(accessToken);
            this.validateDevelopmentClaims(claims);
            return claims;
        }

        const appId = this.requiredConfig('PRIVY_APP_ID', 'Privy app ID is not configured');
        const publicKey = this.config.get<string>('PRIVY_VERIFICATION_KEY');
        if (!publicKey) {
            throw new UnauthorizedException('Privy verification key is not configured');
        }

        try {
            const verified = await this.verifyPrivyAccessToken({
                access_token: accessToken,
                app_id: appId,
                verification_key: publicKey.replace(/\\n/g, '\n'),
            });
            return {
                sid: verified.session_id,
                sub: verified.user_id,
                iss: verified.issuer,
                aud: verified.app_id,
                iat: verified.issued_at,
                exp: verified.expiration,
            };
        } catch {
            throw new UnauthorizedException('Invalid Privy access token signature');
        }
    }

    private decodeDevelopmentToken(accessToken: string): PrivyAccessTokenClaims {
        const parts = accessToken.split('.');
        if (parts.length !== 3) {
            throw new UnauthorizedException('Invalid Privy access token');
        }
        try {
            return decodeJsonPart<PrivyAccessTokenClaims>(parts[1]);
        } catch {
            throw new UnauthorizedException('Invalid Privy access token');
        }
    }

    private validateDevelopmentClaims(claims: PrivyAccessTokenClaims): void {
        const appId = this.config.get<string>('PRIVY_APP_ID');
        if (!appId) {
            throw new UnauthorizedException('Privy app ID is not configured');
        }
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

    private requiredConfig(name: string, errorMessage: string): string {
        const value = this.config.get<string>(name)?.trim();
        if (!value) {
            throw new UnauthorizedException(errorMessage);
        }
        return value;
    }

    private devUnsignedTokensAllowed(): boolean {
        return (
            this.config.get<string>('NODE_ENV') !== 'production' &&
            this.config.get<string>('PRIVY_AUTH_DEV_ALLOW_UNSIGNED') === 'true'
        );
    }
}
