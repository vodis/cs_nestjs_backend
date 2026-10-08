import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { getAddress, verifyMessage } from 'ethers';
import type { WalletOwnershipVerifier } from './wallet-ownership-verifier';
import type { WalletLinkChallenge } from '../../database/models/wallet-link-challenge.model';

@Injectable()
export class EvmWalletProofVerifier implements WalletOwnershipVerifier {
    readonly chainType = 'ethereum';
    readonly proofType = 'eip191';
    normalizeAddress(address: string): string {
        try {
            return getAddress(address).toLowerCase();
        } catch {
            throw new BadRequestException('Invalid EVM wallet address');
        }
    }
    challenge(id: string, address: string, nonce: string) {
        return {
            message: `Link Ethereum wallet ${address} to CraftScript account. Challenge: ${id}. Nonce: ${nonce}`,
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
            !/^0x[0-9a-f]{130}$/i.test(proof.signature)
        )
            throw new BadRequestException('Invalid EVM ownership signature');
        return proof.signature;
    }
    proofFingerprint(proof: unknown): string {
        return createHash('sha256').update(this.signature(proof)).digest('hex');
    }
    async verify(
        challenge: Pick<WalletLinkChallenge, 'id' | 'address' | 'nonce' | 'expiresAt'>,
        proof: unknown,
    ): Promise<void> {
        const message = this.challenge(challenge.id, challenge.address, challenge.nonce).message;
        try {
            if (verifyMessage(message, this.signature(proof)).toLowerCase() === challenge.address) return;
        } catch {
            /* A malformed or unrelated signature is never ownership proof. */
        }
        throw new ForbiddenException('Invalid EVM wallet ownership signature');
    }
}
