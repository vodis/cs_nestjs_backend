import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SUPPORTED_LOGIN_METHODS = ['email', 'google', 'apple', 'passkey'] as const;

export type PublicAuthLoginMethod = (typeof SUPPORTED_LOGIN_METHODS)[number];

export type PublicAuthConfig = {
    version: 1;
    enabled: boolean;
    provider: 'privy';
    privyAppId: string | null;
    loginMethods: PublicAuthLoginMethod[];
    walletOnboarding: {
        embeddedWallet: boolean;
        externalWalletBinding: boolean;
    };
};

@Injectable()
export class PublicAuthConfigService {
    constructor(private readonly config: ConfigService) {}

    getConfig(): PublicAuthConfig {
        const privyAppId = this.optionalString('PRIVY_APP_ID');
        const privyEnabled = Boolean(privyAppId);

        return {
            version: 1,
            enabled: privyEnabled,
            provider: 'privy',
            privyAppId: privyAppId ?? null,
            loginMethods: privyEnabled ? this.loginMethods() : [],
            walletOnboarding: {
                embeddedWallet: privyEnabled && this.booleanFlag('PRIVY_EMBEDDED_WALLET_ENABLED', true),
                externalWalletBinding: privyEnabled && this.booleanFlag('EXTERNAL_WALLET_BINDING_ENABLED', true),
            },
        };
    }

    private loginMethods(): PublicAuthLoginMethod[] {
        const configured = this.optionalString('PRIVY_LOGIN_METHODS');
        if (!configured) {
            return [...SUPPORTED_LOGIN_METHODS];
        }

        const configuredMethods = configured
            .split(',')
            .map((method) => method.trim().toLowerCase())
            .filter(isSupportedLoginMethod);

        return configuredMethods.length > 0 ? configuredMethods : [...SUPPORTED_LOGIN_METHODS];
    }

    private booleanFlag(name: string, defaultValue: boolean): boolean {
        const value = this.optionalString(name);
        if (value === undefined) {
            return defaultValue;
        }
        return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    }

    private optionalString(name: string): string | undefined {
        const value = this.config.get<string>(name);
        const normalized = value?.trim();
        return normalized || undefined;
    }
}

function isSupportedLoginMethod(value: string): value is PublicAuthLoginMethod {
    return SUPPORTED_LOGIN_METHODS.some((method) => method === value);
}
