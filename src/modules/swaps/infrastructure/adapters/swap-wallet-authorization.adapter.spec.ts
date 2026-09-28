import { Sequelize } from 'sequelize-typescript';
import { AppUser } from '../../../../database/models/app-user.model';
import { WalletLink } from '../../../../database/models/wallet-link.model';
import { SwapWalletAuthorizationAdapter } from './swap-wallet-authorization.adapter';

describe('SwapWalletAuthorizationAdapter', () => {
    let sequelize: Sequelize;
    let user: AppUser;
    const authorization = new SwapWalletAuthorizationAdapter();

    beforeEach(async () => {
        sequelize = new Sequelize({
            dialect: 'sqlite',
            storage: ':memory:',
            logging: false,
            models: [AppUser, WalletLink],
        });
        await sequelize.sync({ force: true });
        user = await AppUser.create({ privyUserId: 'did:privy:swap-user', status: 'active' });
    });

    afterEach(async () => sequelize.close());

    it('requires a fresh ownership proof marker for active NEAR links', async () => {
        const wallet = await WalletLink.create({
            userId: user.id,
            address: 'alice.near',
            privyWalletId: 'alice.near',
            chainType: 'near',
            walletType: 'external',
            source: 'near',
            status: 'active',
            isPrimary: false,
        });
        expect(await authorization.isOwnedByUser(user.id, 'alice.near', 'near')).toBe(false);
        await wallet.update({ ownershipVerifiedAt: new Date() });
        expect(await authorization.isOwnedByUser(user.id, 'alice.near', 'near')).toBe(true);
        await wallet.update({ status: 'deleted' });
        expect(await authorization.isOwnedByUser(user.id, 'alice.near', 'near')).toBe(false);
    });
});
