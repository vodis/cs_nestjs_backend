import { ConfigService } from '@nestjs/config';
import { PublicAuthConfigService } from './public-auth-config.service';

function service(values: Record<string, string | undefined>) {
    return new PublicAuthConfigService(new ConfigService(values));
}

describe('PublicAuthConfigService', () => {
    it('returns disabled public config when Privy app id is not configured', () => {
        expect(service({}).getConfig()).toEqual({
            version: 1,
            enabled: false,
            provider: 'privy',
            privyAppId: null,
            loginMethods: [],
            passkeyLoginEnabled: false,
            passkeySignupEnabled: false,
            passkeyLinkEnabled: false,
            walletOnboarding: {
                embeddedWallet: false,
                externalWalletBinding: false,
            },
        });
    });

    it('returns default public auth capabilities when Privy app id is configured', () => {
        expect(service({ PRIVY_APP_ID: 'privy-app-id', PRIVY_APP_SECRET: 'server-secret' }).getConfig()).toEqual({
            version: 1,
            enabled: true,
            provider: 'privy',
            privyAppId: 'privy-app-id',
            loginMethods: ['email', 'google', 'apple', 'passkey'],
            passkeyLoginEnabled: true,
            passkeySignupEnabled: false,
            passkeyLinkEnabled: true,
            walletOnboarding: {
                embeddedWallet: true,
                externalWalletBinding: false,
            },
        });
    });

    it('disables embedded wallets when authoritative ownership verification is unavailable', () => {
        expect(service({ PRIVY_APP_ID: 'privy-app-id' }).getConfig().walletOnboarding.embeddedWallet).toBe(false);
    });

    it('filters configured login methods to supported public methods', () => {
        expect(
            service({
                PRIVY_APP_ID: 'privy-app-id',
                PRIVY_LOGIN_METHODS: 'email, google, unsupported, passkey',
            }).getConfig().loginMethods,
        ).toEqual(['email', 'google', 'passkey']);
    });

    it('can disable configured passkey login without disabling passkey linking', () => {
        expect(
            service({
                PRIVY_APP_ID: 'privy-app-id',
                PRIVY_LOGIN_METHODS: 'email, passkey',
                PRIVY_PASSKEY_LOGIN_ENABLED: 'false',
            }).getConfig(),
        ).toMatchObject({
            loginMethods: ['email'],
            passkeyLoginEnabled: false,
            passkeySignupEnabled: false,
            passkeyLinkEnabled: true,
        });
    });

    it('keeps passkey signup disabled even when passkey login is configured', () => {
        expect(
            service({
                PRIVY_APP_ID: 'privy-app-id',
                PRIVY_LOGIN_METHODS: 'email, passkey',
            }).getConfig(),
        ).toMatchObject({
            loginMethods: ['email', 'passkey'],
            passkeyLoginEnabled: true,
            passkeySignupEnabled: false,
            passkeyLinkEnabled: true,
        });
    });

    it('supports disabling passkey linking independently from login methods', () => {
        expect(
            service({
                PRIVY_APP_ID: 'privy-app-id',
                PRIVY_PASSKEY_LINK_ENABLED: 'false',
            }).getConfig().passkeyLinkEnabled,
        ).toBe(false);
    });

    it('supports disabling wallet onboarding capabilities independently', () => {
        expect(
            service({
                PRIVY_APP_ID: 'privy-app-id',
                PRIVY_EMBEDDED_WALLET_ENABLED: 'false',
                EXTERNAL_WALLET_BINDING_ENABLED: '0',
            }).getConfig().walletOnboarding,
        ).toEqual({
            embeddedWallet: false,
            externalWalletBinding: false,
        });
    });

    it('does not expose server-only Privy verification config', () => {
        expect(
            service({
                PRIVY_APP_ID: 'privy-app-id',
                PRIVY_JWKS_URL: 'https://auth.privy.io/example/jwks.json',
            }).getConfig(),
        ).not.toHaveProperty('privyVerificationKey');
    });
});
