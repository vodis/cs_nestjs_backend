import { Injectable } from '@nestjs/common';
import { PrivyAuthService } from '../../../api/auth/privy-auth.service';
import { DepositWalletSource, ReceiveWallet } from '../application/deposit.ports';

@Injectable()
export class DepositWalletAdapter extends DepositWalletSource {
    constructor(private readonly auth: PrivyAuthService) {
        super();
    }

    async selected(userId: string): Promise<ReceiveWallet | null> {
        const wallets = await this.auth.walletsForUser(userId);
        const wallet = wallets.find((item) => item.isPrimary && item.status === 'active' && !item.deletedAt);
        return wallet ? { id: wallet.id, address: wallet.address, chainType: wallet.chainType } : null;
    }
}
