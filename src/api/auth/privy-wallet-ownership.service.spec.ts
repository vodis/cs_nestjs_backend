import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LinkedAccountEmbeddedWallet } from '@privy-io/node';
import { type PrivyEmbeddedWalletLookup, PrivyWalletOwnershipService } from './privy-wallet-ownership.service';

function embeddedWallet(): Extract<LinkedAccountEmbeddedWallet, { chain_type: 'ethereum' }> {
    return {
        id: 'wallet-1',
        address: '0xa000000000000000000000000000000000000001',
        chain_id: 'eip155:1',
        chain_type: 'ethereum',
        connector_type: 'embedded',
        delegated: false,
        first_verified_at: null,
        imported: false,
        latest_verified_at: null,
        recovery_method: 'privy',
        type: 'wallet',
        verified_at: 1,
        wallet_client: 'privy',
        wallet_client_type: 'privy',
        wallet_index: 0,
    };
}

function serviceWith(wallets: LinkedAccountEmbeddedWallet[]) {
    const lookup: jest.MockedFunction<PrivyEmbeddedWalletLookup> = jest.fn().mockResolvedValue(wallets);
    const service = new PrivyWalletOwnershipService(
        new ConfigService({ PRIVY_APP_ID: 'app-id', PRIVY_APP_SECRET: 'app-secret' }),
        lookup,
    );
    return { service, lookup };
}

describe('PrivyWalletOwnershipService', () => {
    it('accepts an embedded wallet returned by Privy for the authenticated user', async () => {
        const { service, lookup } = serviceWith([embeddedWallet()]);

        await expect(
            service.assertOwned('did:privy:user-1', {
                privyWalletId: 'wallet-1',
                address: '0xA000000000000000000000000000000000000001',
                chainType: 'ethereum',
                walletType: 'embedded',
                source: 'privy',
            }),
        ).resolves.toBeUndefined();
        expect(lookup).toHaveBeenCalledWith({
            appId: 'app-id',
            appSecret: 'app-secret',
            userId: 'did:privy:user-1',
        });
    });

    it('rejects a client-submitted wallet that Privy does not assign to the user', async () => {
        const { service } = serviceWith([embeddedWallet()]);

        await expect(
            service.assertOwned('did:privy:user-1', {
                privyWalletId: 'wallet-other',
                address: '0xb000000000000000000000000000000000000002',
                walletType: 'embedded',
                source: 'privy',
            }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('accepts an authoritative address when Privy does not expose a wallet ID', async () => {
        const { service } = serviceWith([embeddedWallet()]);

        await expect(
            service.assertOwned('did:privy:user-1', {
                address: '0xA000000000000000000000000000000000000001',
                walletType: 'embedded',
                source: 'privy',
            }),
        ).resolves.toBeUndefined();
    });

    it('rejects external wallet binding until a signed challenge flow is provided', async () => {
        const { service } = serviceWith([]);

        await expect(
            service.assertOwned('did:privy:user-1', {
                address: '0xa000000000000000000000000000000000000001',
                walletType: 'external',
                source: 'metamask',
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
