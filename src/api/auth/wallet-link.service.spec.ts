import { createHash, generateKeyPairSync, sign } from 'crypto';
import { Sequelize } from 'sequelize-typescript';
import { AppUser } from '../../database/models/app-user.model';
import { AuthAuditEvent } from '../../database/models/auth-audit-event.model';
import { WalletLinkChallenge } from '../../database/models/wallet-link-challenge.model';
import { WalletLink } from '../../database/models/wallet-link.model';
import { ChainRpcService } from '../balances/rpc/chain-rpc.service';
import { ChainRpcRequestError } from '../balances/rpc/chain-rpc.types';
import { WalletLinkService } from './wallet-link.service';
import { NearWalletProofVerifier } from './near-wallet-proof.verifier';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(bytes: Buffer): string {
    let number = BigInt(`0x${bytes.toString('hex')}`);
    let result = '';
    while (number > 0n) {
        result = ALPHABET[Number(number % 58n)] + result;
        number /= 58n;
    }
    return result;
}

function signChallenge(challenge: { message: string; nonce: string; recipient: string }) {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const tag = Buffer.alloc(4);
    tag.writeUInt32LE(0x80000000 + 413);
    const borshString = (text: string) => {
        const content = Buffer.from(text);
        const length = Buffer.alloc(4);
        length.writeUInt32LE(content.length);
        return Buffer.concat([length, content]);
    };
    const digest = createHash('sha256')
        .update(
            Buffer.concat([
                tag,
                borshString(challenge.message),
                Buffer.from(challenge.nonce, 'base64'),
                borshString(challenge.recipient),
                Buffer.from([0]),
            ]),
        )
        .digest();
    const bytes = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
    return {
        publicKey: `ed25519:${encodeBase58(bytes)}`,
        signature: sign(null, digest, privateKey).toString('base64'),
    };
}

describe('WalletLinkService wallet-link incident regression', () => {
    let sequelize: Sequelize;
    let service: WalletLinkService;
    let user: AppUser;
    let rpc: jest.Mock;

    beforeEach(async () => {
        sequelize = new Sequelize({
            dialect: 'sqlite',
            storage: ':memory:',
            logging: false,
            models: [AppUser, WalletLink, WalletLinkChallenge, AuthAuditEvent],
        });
        await sequelize.sync({ force: true });
        user = await AppUser.create({ privyUserId: 'did:privy:near-user', status: 'active' });
        rpc = jest.fn().mockResolvedValue({ result: { permission: 'FullAccess' } });
        service = new WalletLinkService(sequelize, [
            new NearWalletProofVerifier({ request: rpc } as unknown as ChainRpcService),
        ]);
    });

    afterEach(async () => sequelize.close());

    const actor = (id: string) => ({
        id,
        privyUserId: 'did:privy:near-user',
        sessionId: 'session',
        passkeyEnabled: false,
    });

    it('links a NEAR wallet only after its signed, account-bound challenge and current full-access key', async () => {
        const challenge = await service.createChallenge(actor(user.id), 'near', 'Alice.NEAR');
        const proof = signChallenge(challenge);
        const wallet = await service.verifyChallenge(actor(user.id), {
            challengeId: challenge.challengeId,
            chainType: 'near',
            proof,
        });

        expect(wallet.address).toBe('alice.near');
        expect(wallet.status).toBe('active');
        expect(wallet.ownershipVerifiedAt).toBeInstanceOf(Date);
        expect(rpc).toHaveBeenCalledWith(
            'near:mainnet',
            'query',
            expect.objectContaining({
                account_id: 'alice.near',
                public_key: proof.publicKey,
            }),
        );
        expect(await WalletLink.count()).toBe(1);
        await expect(
            service.verifyChallenge(actor(user.id), {
                challengeId: challenge.challengeId,
                chainType: 'near',
                proof: signChallenge(challenge),
            }),
        ).rejects.toThrow();
        await expect(
            service.verifyChallenge(actor(user.id), { challengeId: challenge.challengeId, chainType: 'near', proof }),
        ).resolves.toMatchObject({ id: wallet.id });
        expect(await WalletLink.count()).toBe(1);
    });

    it('rejects tampering, a different user, and a function-call key without creating a link', async () => {
        const challenge = await service.createChallenge(actor(user.id), 'near', 'alice.near');
        const proof = signChallenge(challenge);
        await expect(
            service.verifyChallenge(actor('00000000-0000-4000-8000-000000000001'), {
                challengeId: challenge.challengeId,
                chainType: 'near',
                proof,
            }),
        ).rejects.toThrow();
        await expect(
            service.verifyChallenge(actor(user.id), {
                challengeId: challenge.challengeId,
                chainType: 'near',
                proof: { ...proof, signature: signChallenge(challenge).signature },
            }),
        ).rejects.toThrow();
        rpc.mockResolvedValue({ result: { permission: { FunctionCall: {} } } });
        await expect(
            service.verifyChallenge(actor(user.id), { challengeId: challenge.challengeId, chainType: 'near', proof }),
        ).rejects.toThrow();
        expect(await WalletLink.count()).toBe(0);
    });

    it('rejects an expired proof and can reactivate a removed link with a fresh proof', async () => {
        const expired = await service.createChallenge(actor(user.id), 'near', 'alice.near');
        await WalletLinkChallenge.update({ expiresAt: new Date(0) }, { where: { id: expired.challengeId } });
        await expect(
            service.verifyChallenge(actor(user.id), {
                challengeId: expired.challengeId,
                chainType: 'near',
                proof: signChallenge(expired),
            }),
        ).rejects.toThrow();

        const first = await service.createChallenge(actor(user.id), 'near', 'alice.near');
        const wallet = await service.verifyChallenge(actor(user.id), {
            challengeId: first.challengeId,
            chainType: 'near',
            proof: signChallenge(first),
        });
        await wallet.update({ status: 'deleted', deletedAt: new Date() });
        await expect(
            service.verifyChallenge(actor(user.id), {
                challengeId: first.challengeId,
                chainType: 'near',
                proof: signChallenge(first),
            }),
        ).rejects.toThrow();
        const second = await service.createChallenge(actor(user.id), 'near', 'alice.near');
        const relinked = await service.verifyChallenge(actor(user.id), {
            challengeId: second.challengeId,
            chainType: 'near',
            proof: signChallenge(second),
        });
        expect(relinked.id).toBe(wallet.id);
        expect(relinked.status).toBe('active');
        expect(await WalletLink.count()).toBe(1);
    });

    it('rejects networks without an ownership verifier', async () => {
        await expect(service.createChallenge(actor(user.id), 'evm', '0x1234')).rejects.toThrow();
        expect(await WalletLinkChallenge.count()).toBe(0);
    });

    it('rejects a network proof with the wrong shape before recording a link', async () => {
        const challenge = await service.createChallenge(actor(user.id), 'near', 'alice.near');
        await expect(
            service.verifyChallenge(actor(user.id), {
                challengeId: challenge.challengeId,
                chainType: 'near',
                proof: { accountId: 'alice.near' },
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(await WalletLink.count()).toBe(0);
    });

    it('denies a proof whose NEAR access key no longer exists', async () => {
        const challenge = await service.createChallenge(actor(user.id), 'near', 'alice.near');
        rpc.mockRejectedValueOnce(new ChainRpcRequestError('RPC provider rejected the request', false));
        await expect(
            service.verifyChallenge(actor(user.id), {
                challengeId: challenge.challengeId,
                chainType: 'near',
                proof: signChallenge(challenge),
            }),
        ).rejects.toMatchObject({ status: 403 });
        expect(await WalletLink.count()).toBe(0);
    });
});
