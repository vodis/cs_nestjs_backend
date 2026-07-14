import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SUPPORTED_LOGIN_METHODS = ['email', 'google', 'apple', 'passkey'] as const;
const DEFAULT_LOGIN_METHODS: PublicAuthLoginMethod[] = ['email', 'google', 'apple'];

export type PublicAuthLoginMethod = (typeof SUPPORTED_LOGIN_METHODS)[number];

export type PublicAuthConfig = {
    version: 1;
    enabled: boolean;
    provider: 'privy';
    privyAppId: string | null;
    loginMethods: PublicAuthLoginMethod[];
    passkeyLoginEnabled: boolean;
    passkeySignupEnabled: boolean;
    passkeyLinkEnabled: boolean;
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
        const embeddedWalletVerificationEnabled = Boolean(this.optionalString('PRIVY_APP_SECRET'));
        const requestedLoginMethods = privyEnabled ? this.loginMethods() : [];
        const passkeyLoginEnabled =
            privyEnabled &&
            requestedLoginMethods.includes('passkey') &&
            this.booleanFlag('PRIVY_PASSKEY_LOGIN_ENABLED', true);
        const loginMethods = passkeyLoginEnabled
            ? requestedLoginMethods
            : requestedLoginMethods.filter((method) => method !== 'passkey');
        const passkeyLinkEnabled = privyEnabled && this.booleanFlag('PRIVY_PASSKEY_LINK_ENABLED', true);

        return {
            version: 1,
            enabled: privyEnabled,
            provider: 'privy',
            privyAppId: privyAppId ?? null,
            loginMethods,
            passkeyLoginEnabled,
            passkeySignupEnabled:
                passkeyLoginEnabled && this.booleanFlag('PRIVY_PASSKEY_SIGNUP_ENABLED', false),
            passkeyLinkEnabled,
            walletOnboarding: {
                embeddedWallet:
                    privyEnabled &&
                    embeddedWalletVerificationEnabled &&
                    this.booleanFlag('PRIVY_EMBEDDED_WALLET_ENABLED', true),
                externalWalletBinding: privyEnabled && this.booleanFlag('EXTERNAL_WALLET_BINDING_ENABLED', false),
            },
        };
    }

    private loginMethods(): PublicAuthLoginMethod[] {
        const configured = this.optionalString('PRIVY_LOGIN_METHODS');
        if (!configured) {
            return [...DEFAULT_LOGIN_METHODS];
        }

        const configuredMethods = configured
            .split(',')
            .map((method) => method.trim().toLowerCase())
            .filter(isSupportedLoginMethod);

        return configuredMethods.length > 0 ? configuredMethods : [...DEFAULT_LOGIN_METHODS];
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
