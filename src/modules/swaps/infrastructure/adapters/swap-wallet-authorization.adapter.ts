import { Injectable } from '@nestjs/common';
import { Op } from 'sequelize';
import { WalletLink } from '../../../../database/models/wallet-link.model';
import { SwapWalletAuthorizationPort } from '../../application/ports/swap-wallet-authorization.port';

@Injectable()
export class SwapWalletAuthorizationAdapter implements SwapWalletAuthorizationPort {
    async isOwnedByUser(
        userId: string,
        address: string,
        chainType: 'evm' | 'near' | 'ton' | 'solana' | 'bitcoin',
    ): Promise<boolean> {
        const wallet = await WalletLink.findOne({
            where: {
                userId,
                address: chainType === 'evm' || chainType === 'near' ? address.trim().toLowerCase() : address.trim(),
                status: 'active',
                chainType: { [Op.in]: chainType === 'evm' ? ['evm', 'ethereum'] : [chainType] },
                ...(chainType !== 'evm'
                    ? { ownershipVerifiedAt: { [Op.ne]: null } }
                    : {
                          [Op.or]: [{ walletType: 'embedded' }, { ownershipVerifiedAt: { [Op.ne]: null } }],
                      }),
            },
        });
        return Boolean(wallet);
    }
}
