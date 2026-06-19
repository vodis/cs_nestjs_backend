import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, verify as cryptoVerify } from 'crypto';

export type PrivyAccessTokenClaims = {
    sid: string;
    sub: string;
    iss: string;
    aud: string;
    iat: number;
    exp: number;
    email?: string;
};

type JwtHeader = {
    alg?: string;
    typ?: string;
};

function base64UrlDecode(value: string): Buffer {
    const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
    return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function decodeJsonPart<T>(part: string): T {
    return JSON.parse(base64UrlDecode(part).toString('utf8')) as T;
}

function parsePemOrBase64PublicKey(value: string) {
    if (value.includes('BEGIN PUBLIC KEY')) {
        return createPublicKey(value.replace(/\\n/g, '\n'));
    }
    return createPublicKey({
        key: base64UrlDecode(value).toString('base64'),
        format: 'der',
        type: 'spki',
    });
}

@Injectable()
export class PrivyTokenService {
    constructor(private readonly config: ConfigService) {}

    verifyAccessToken(accessToken: string): PrivyAccessTokenClaims {
        const parts = accessToken.split('.');
        if (parts.length !== 3) {
            throw new UnauthorizedException('Invalid Privy access token');
        }

        const header = decodeJsonPart<JwtHeader>(parts[0]);
        const claims = decodeJsonPart<PrivyAccessTokenClaims>(parts[1]);
        this.validateClaims(claims);

        if (this.devUnsignedTokensAllowed()) {
            return claims;
        }

        const publicKey = this.config.get<string>('PRIVY_VERIFICATION_KEY');
        if (!publicKey) {
            throw new UnauthorizedException('Privy verification key is not configured');
        }

        const signedPayload = Buffer.from(`${parts[0]}.${parts[1]}`);
        const signature = base64UrlDecode(parts[2]);
        const key = parsePemOrBase64PublicKey(publicKey);
        let isValid = false;

        if (header.alg === 'ES256') {
            isValid = cryptoVerify(
                'sha256',
                signedPayload,
                { key, dsaEncoding: 'ieee-p1363' },
                signature,
            );
        } else if (header.alg === 'EdDSA') {
            isValid = cryptoVerify(null, signedPayload, key, signature);
        } else {
            throw new UnauthorizedException('Unsupported Privy token algorithm');
        }

        if (!isValid) {
            throw new UnauthorizedException('Invalid Privy access token signature');
        }

        return claims;
    }

    private validateClaims(claims: PrivyAccessTokenClaims): void {
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

    private devUnsignedTokensAllowed(): boolean {
        return (
            this.config.get<string>('NODE_ENV') !== 'production' &&
            this.config.get<string>('PRIVY_AUTH_DEV_ALLOW_UNSIGNED') === 'true'
        );
    }
}
