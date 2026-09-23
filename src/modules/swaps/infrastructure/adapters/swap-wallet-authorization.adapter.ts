import { Injectable } from '@nestjs/common';
import { Op } from 'sequelize';
import { WalletLink } from '../../../../database/models/wallet-link.model';
import { SwapWalletAuthorizationPort } from '../../application/ports/swap-wallet-authorization.port';

@Injectable()
export class SwapWalletAuthorizationAdapter implements SwapWalletAuthorizationPort {
    async isOwnedByUser(userId: string, address: string, chainType: 'evm' | 'near'): Promise<boolean> {
        const wallet = await WalletLink.findOne({
            where: {
                userId,
                address: address.trim().toLowerCase(),
                status: 'active',
                chainType: { [Op.in]: chainType === 'evm' ? ['evm', 'ethereum'] : ['near'] },
            },
        });
        return Boolean(wallet);
    }
}
