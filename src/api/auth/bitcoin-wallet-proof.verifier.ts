import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Address, Verifier } from 'bip322-js';
import type { WalletOwnershipVerifier } from './wallet-ownership-verifier';
import type { WalletLinkChallenge } from '../../database/models/wallet-link-challenge.model';

@Injectable()
export class BitcoinWalletProofVerifier implements WalletOwnershipVerifier {
    readonly chainType = 'bitcoin';
    readonly proofType = 'bip322';
    normalizeAddress(address: string): string {
        if (!/^(?:[13]|bc1)/.test(address) || !Address.isValidBitcoinAddress(address))
            throw new BadRequestException('Invalid Bitcoin mainnet wallet address');
        return address;
    }
    challenge(id: string, address: string, nonce: string) {
        return {
            message: `Link Bitcoin wallet ${address} to CraftScript account. Challenge: ${id}. Nonce: ${nonce}`,
            recipient: 'craftscript.com',
            nonce,
        };
    }
    private signature(proof: unknown): string {
        if (
            !proof ||
            typeof proof !== 'object' ||
            !('signature' in proof) ||
            typeof proof.signature !== 'string' ||
            proof.signature.length > 4096 ||
            !/^[A-Za-z0-9+/]+={0,2}$/.test(proof.signature)
        )
            throw new BadRequestException('Invalid Bitcoin ownership signature');
        return proof.signature;
    }
    proofFingerprint(proof: unknown): string {
        return createHash('sha256').update(this.signature(proof)).digest('hex');
    }
    async verify(challenge: Pick<WalletLinkChallenge, 'id' | 'address' | 'nonce'>, proof: unknown): Promise<void> {
        const address = this.normalizeAddress(challenge.address);
        const message = this.challenge(challenge.id, address, challenge.nonce).message;
        try {
            if (Verifier.verifySignature(address, message, this.signature(proof), true)) return;
        } catch {
            /* Invalid ownership proof is rejected below. */
        }
        throw new ForbiddenException('Invalid Bitcoin wallet ownership signature');
    }
}
