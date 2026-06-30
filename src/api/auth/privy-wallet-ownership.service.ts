import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LinkedAccountEmbeddedWallet } from '@privy-io/node';
import type { PrivyWalletDto } from './dto/privy-session.dto';
import type { BindWalletDto } from './dto/wallet-binding.dto';

export const PRIVY_EMBEDDED_WALLET_LOOKUP = Symbol('PRIVY_EMBEDDED_WALLET_LOOKUP');

export type PrivyEmbeddedWalletLookupInput = {
    appId: string;
    appSecret: string;
    userId: string;
};

export type PrivyEmbeddedWalletLookup = (
    input: PrivyEmbeddedWalletLookupInput,
) => Promise<LinkedAccountEmbeddedWallet[]>;

type PrivyNodeSdk = typeof import('@privy-io/node');

const importPrivyNodeSdk = new Function('return import("@privy-io/node")') as () => Promise<PrivyNodeSdk>;

export const lookupPrivyEmbeddedWallets: PrivyEmbeddedWalletLookup = async ({ appId, appSecret, userId }) => {
    const sdk = await importPrivyNodeSdk();
    const client = new sdk.PrivyClient({ appId, appSecret });
    const user = await client.users()._get(userId);
    return user.linked_accounts.filter(sdk.isEmbeddedWalletLinkedAccount);
};

@Injectable()
export class PrivyWalletOwnershipService {
    constructor(
        private readonly config: ConfigService,
        @Inject(PRIVY_EMBEDDED_WALLET_LOOKUP)
        private readonly lookupEmbeddedWallets: PrivyEmbeddedWalletLookup,
    ) {}

    async assertOwned(userId: string, wallet: PrivyWalletDto | BindWalletDto): Promise<void> {
        const walletType = wallet.walletType ?? 'embedded';
        const source = wallet.source ?? (walletType === 'embedded' ? 'privy' : undefined);

        if (walletType !== 'embedded' || source !== 'privy') {
            throw new BadRequestException('External wallet binding requires a signed ownership challenge');
        }
        const appId = this.requiredConfig('PRIVY_APP_ID');
        const appSecret = this.requiredConfig('PRIVY_APP_SECRET');
        let wallets: LinkedAccountEmbeddedWallet[];
        try {
            wallets = await this.lookupEmbeddedWallets({ appId, appSecret, userId });
        } catch {
            throw new UnauthorizedException('Unable to verify Privy embedded wallet ownership');
        }

        const address = wallet.address.trim().toLowerCase();
        const owned = wallets.some(
            (candidate) =>
                candidate.address.toLowerCase() === address &&
                (!wallet.privyWalletId || candidate.id === wallet.privyWalletId),
        );
        if (!owned) {
            throw new UnauthorizedException('Privy embedded wallet does not belong to the authenticated user');
        }
    }

    private requiredConfig(name: string): string {
        const value = this.config.get<string>(name)?.trim();
        if (!value) {
            throw new UnauthorizedException(`${name} is not configured`);
        }
        return value;
    }
}
