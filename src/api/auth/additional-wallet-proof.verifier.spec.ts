import { generateKeyPairSync, sign } from 'crypto';
import { PublicKey } from '@solana/web3.js';
import { Signer } from 'bip322-js';
import { SolanaWalletProofVerifier } from './solana-wallet-proof.verifier';
import { BitcoinWalletProofVerifier } from './bitcoin-wallet-proof.verifier';

describe('additional wallet ownership proofs', () => {
    it('verifies Solana Ed25519 signatures and binds the nonce and address', async () => {
        const { publicKey, privateKey } = generateKeyPairSync('ed25519');
        const address = new PublicKey(publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)).toBase58();
        const verifier = new SolanaWalletProofVerifier();
        const challenge = { id: 'challenge', address, nonce: 'single-use-nonce' };
        const message = verifier.challenge(challenge.id, address, challenge.nonce).message;
        const proof = { signature: sign(null, Buffer.from(message), privateKey).toString('base64') };
        await expect(verifier.verify(challenge, proof)).resolves.toBeUndefined();
        await expect(verifier.verify({ ...challenge, nonce: 'other' }, proof)).rejects.toThrow('ownership');
        const [offCurve] = PublicKey.findProgramAddressSync([Buffer.from('test')], new PublicKey(address));
        expect(() => verifier.normalizeAddress(offCurve.toBase58())).toThrow();
        expect(() => verifier.proofFingerprint({ signature: 'invalid' })).toThrow();
    });

    it('verifies Bitcoin BIP-322 proofs, rejects replayed messages and testnet addresses', async () => {
        // Public test vector from bip322-js README; never use this key for funds.
        const key = 'L3VFeEujGtevx9w18HD1fhRbCH67Az2dpCymeRE1SoPK6XQtaN2k';
        const address = 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l';
        const verifier = new BitcoinWalletProofVerifier();
        const challenge = { id: 'challenge', address, nonce: 'single-use-nonce' };
        const proof = {
            signature: Signer.sign(key, address, verifier.challenge(challenge.id, address, challenge.nonce).message),
        };
        await expect(verifier.verify(challenge, proof)).resolves.toBeUndefined();
        await expect(verifier.verify({ ...challenge, id: 'other' }, proof)).rejects.toThrow('ownership');
        expect(() => verifier.normalizeAddress('tb1q9vza2e8x573nczrlzms0wvx3gsqjx7vaxwd45v')).toThrow('mainnet');
        expect(() => verifier.normalizeAddress(`${address.slice(0, -1)}a`)).toThrow();
    });
});
