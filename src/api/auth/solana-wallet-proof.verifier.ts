import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, createPublicKey, verify } from 'crypto';
import { PublicKey } from '@solana/web3.js';
import type { WalletOwnershipVerifier } from './wallet-ownership-verifier';
import type { WalletLinkChallenge } from '../../database/models/wallet-link-challenge.model';

@Injectable()
export class SolanaWalletProofVerifier implements WalletOwnershipVerifier {
    readonly chainType = 'solana';
    readonly proofType = 'ed25519';
    normalizeAddress(address: string): string {
        try {
            const key = new PublicKey(address);
            if (key.toBase58() !== address || !PublicKey.isOnCurve(key.toBytes())) throw new Error();
            return address;
        } catch {
            throw new BadRequestException('Invalid Solana wallet address');
        }
    }
    challenge(id: string, address: string, nonce: string) {
        return {
            message: `Link Solana wallet ${address} to CraftScript account. Challenge: ${id}. Nonce: ${nonce}`,
            recipient: 'craftscript.com',
            nonce,
        };
    }
    private signature(proof: unknown): Buffer {
        if (!proof || typeof proof !== 'object' || !('signature' in proof) || typeof proof.signature !== 'string')
            throw new BadRequestException('Invalid Solana ownership signature');
        const signature = Buffer.from(proof.signature, 'base64');
        if (signature.length !== 64 || signature.toString('base64') !== proof.signature)
            throw new BadRequestException('Invalid Solana ownership signature');
        return signature;
    }
    proofFingerprint(proof: unknown): string {
        return createHash('sha256').update(this.signature(proof)).digest('hex');
    }
    async verify(challenge: Pick<WalletLinkChallenge, 'id' | 'address' | 'nonce'>, proof: unknown): Promise<void> {
        const address = this.normalizeAddress(challenge.address);
        const key = createPublicKey({
            key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), new PublicKey(address).toBuffer()]),
            format: 'der',
            type: 'spki',
        });
        const message = this.challenge(challenge.id, address, challenge.nonce).message;
        if (!verify(null, Buffer.from(message), key, this.signature(proof)))
            throw new ForbiddenException('Invalid Solana wallet ownership signature');
    }
}
