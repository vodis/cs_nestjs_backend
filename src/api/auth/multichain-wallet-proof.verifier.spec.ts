import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Address } from '@ton/core';
import { Wallet } from 'ethers';
import { generateKeyPairSync, sign } from 'crypto';
import { EvmWalletProofVerifier } from './evm-wallet-proof.verifier';
import { TonWalletProofVerifier, tonOwnershipDigest } from './ton-wallet-proof.verifier';
import { TonCenterService } from '../balances/ton/ton-center.service';

describe('swap wallet ownership regression', () => {
    it('binds EVM signatures to the server challenge and exact wallet', async () => {
        const verifier = new EvmWalletProofVerifier();
        const wallet = Wallet.createRandom();
        const challenge = {
            id: 'challenge',
            address: wallet.address.toLowerCase(),
            nonce: 'nonce',
            expiresAt: new Date(Date.now() + 300000),
        };
        const signature = await wallet.signMessage(
            verifier.challenge(challenge.id, challenge.address, challenge.nonce).message,
        );
        await expect(verifier.verify(challenge, { signature })).resolves.toBeUndefined();
        await expect(verifier.verify({ ...challenge, nonce: 'other' }, { signature })).rejects.toThrow('ownership');
        await expect(
            verifier.verify({ ...challenge, address: Wallet.createRandom().address.toLowerCase() }, { signature }),
        ).rejects.toThrow('ownership');
    });
    it.each(['wallets.craftscript.com', 'staging-wallets.craftscript.com'])(
        'verifies TON proofs for the %s manifest and rejects invalid contexts',
        async (domain) => {
            const ton = new TonCenterService(new HttpService(), new ConfigService());
            const verifier = new TonWalletProofVerifier(ton);
            const keys = generateKeyPairSync('ed25519');
            const publicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
            jest.spyOn(ton, 'getWalletPublicKey').mockResolvedValue(publicKey);
            const address = new Address(0, Buffer.alloc(32, 1)).toString({ bounceable: false });
            const challenge = { id: 'challenge', address, nonce: 'nonce', expiresAt: new Date(Date.now() + 300000) };
            const timestamp = Math.floor(Date.now() / 1000);
            const message = verifier.challenge(challenge.id, address, challenge.nonce).message;
            const signature = sign(
                null,
                tonOwnershipDigest(address, domain, timestamp, message),
                keys.privateKey,
            ).toString('base64');
            const proof = { address, domain, timestamp, signature };
            await expect(verifier.verify(challenge, proof)).resolves.toBeUndefined();
            await expect(verifier.verify(challenge, { ...proof, domain: 'attacker.example' })).rejects.toThrow(
                'context',
            );
            await expect(verifier.verify(challenge, { ...proof, domain: 'localhost:5002' })).rejects.toThrow('context');
            await expect(verifier.verify(challenge, { ...proof, timestamp: timestamp - 301 })).rejects.toThrow(
                'context',
            );
            await expect(verifier.verify({ ...challenge, nonce: 'other' }, proof)).rejects.toThrow('signature');
            jest.spyOn(ton, 'getWalletPublicKey').mockResolvedValue(Buffer.alloc(32, 2));
            await expect(verifier.verify(challenge, proof)).rejects.toThrow('signature');
        },
    );
});
