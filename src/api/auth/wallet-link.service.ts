import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Inject,
    Injectable,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { SEQUELIZE } from '../../database/database.tokens';
import { AuthAuditEvent } from '../../database/models/auth-audit-event.model';
import { AppUser } from '../../database/models/app-user.model';
import { WalletLinkChallenge } from '../../database/models/wallet-link-challenge.model';
import { WalletLink } from '../../database/models/wallet-link.model';
import type { AuthenticatedUser } from './types';
import { WALLET_OWNERSHIP_VERIFIERS, WalletOwnershipVerifier } from './wallet-ownership-verifier';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class WalletLinkService {
    constructor(
        @Inject(SEQUELIZE) private readonly sequelize: Sequelize,
        @Inject(WALLET_OWNERSHIP_VERIFIERS) private readonly verifiers: WalletOwnershipVerifier[],
    ) {}

    async createChallenge(user: AuthenticatedUser, chainType: string, address: string) {
        const verifier = this.verifier(chainType);
        const account = verifier.normalizeAddress(address);
        await WalletLinkChallenge.destroy({
            where: { userId: user.id, expiresAt: { [Op.lt]: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        });
        const outstanding = await WalletLinkChallenge.count({
            where: { userId: user.id, consumedAt: null, expiresAt: { [Op.gt]: new Date() } },
        });
        if (outstanding >= 5)
            throw new HttpException('Too many active wallet-link challenges', HttpStatus.TOO_MANY_REQUESTS);

        const id = randomUUID();
        const nonce = randomBytes(32).toString('base64');
        const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
        await WalletLinkChallenge.create({ id, userId: user.id, chainType, address: account, nonce, expiresAt });
        return { challengeId: id, chainType, ...verifier.challenge(id, account, nonce), expiresAt };
    }

    async verifyChallenge(
        user: AuthenticatedUser,
        input: { challengeId: string; chainType: string; proof: unknown },
    ): Promise<WalletLink> {
        const verifier = this.verifier(input.chainType);
        const challenge = await WalletLinkChallenge.findOne({
            where: { id: input.challengeId, userId: user.id, chainType: input.chainType },
        });
        if (!challenge) throw new ConflictException('Wallet-link challenge is unavailable');
        const fingerprint = verifier.proofFingerprint(input.proof);
        if (challenge.consumedAt) return this.existingResult(challenge, fingerprint);
        if (challenge.expiresAt.getTime() <= Date.now())
            throw new ConflictException('Wallet-link challenge is expired');
        await verifier.verify(challenge, input.proof);

        return this.sequelize.transaction(async (transaction) => {
            const account = await AppUser.findByPk(user.id, { transaction });
            if (account?.status !== 'active') throw new ForbiddenException('Account is not active');
            const current = await WalletLinkChallenge.findByPk(challenge.id, {
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!current) throw new ConflictException('Wallet-link challenge is unavailable');
            if (current.consumedAt) return this.existingResult(current, fingerprint, transaction);
            if (current.expiresAt.getTime() <= Date.now())
                throw new ConflictException('Wallet-link challenge is expired');

            const [wallet] = await WalletLink.findOrCreate({
                where: { userId: user.id, address: challenge.address },
                defaults: {
                    userId: user.id,
                    address: challenge.address,
                    // Legacy non-null column; external wallets have no Privy wallet ID.
                    privyWalletId: challenge.address,
                    chainType: input.chainType,
                    walletType: 'external',
                    source: input.chainType,
                    status: 'active',
                    isPrimary: false,
                },
                transaction,
            });
            if (wallet.chainType !== input.chainType || wallet.walletType !== 'external') {
                throw new ConflictException('This address is already linked with a different wallet identity');
            }
            await wallet.update(
                {
                    status: 'active',
                    deletedAt: null,
                    chainType: input.chainType,
                    walletType: 'external',
                    source: input.chainType,
                    ownershipVerifiedAt: new Date(),
                },
                { transaction },
            );
            await current.update(
                { consumedAt: new Date(), proofFingerprint: fingerprint, walletLinkId: wallet.id },
                { transaction },
            );
            await AuthAuditEvent.create(
                {
                    userId: user.id,
                    privyUserId: user.privyUserId,
                    eventType: 'wallet.bind',
                    metadata: {
                        walletId: wallet.id,
                        chainType: input.chainType,
                        source: input.chainType,
                        proof: verifier.proofType,
                    },
                },
                { transaction },
            );
            return wallet;
        });
    }

    private verifier(chainType: string): WalletOwnershipVerifier {
        const verifier = this.verifiers.find((candidate) => candidate.chainType === chainType);
        if (verifier) return verifier;
        throw new BadRequestException('Wallet ownership proof is not supported for this network');
    }

    private async existingResult(
        challenge: WalletLinkChallenge,
        fingerprint: string,
        transaction?: import('sequelize').Transaction,
    ): Promise<WalletLink> {
        if (challenge.proofFingerprint !== fingerprint || !challenge.walletLinkId) {
            throw new ConflictException('Wallet-link challenge was used with a different proof');
        }
        const wallet = await WalletLink.findOne({
            where: { id: challenge.walletLinkId, userId: challenge.userId, status: 'active' },
            transaction,
        });
        if (!wallet) throw new ConflictException('Wallet link is no longer active; create a new challenge');
        return wallet;
    }
}
