import { WalletLinkChallenge } from '../../database/models/wallet-link-challenge.model';

export interface WalletOwnershipVerifier {
    readonly chainType: string;
    readonly proofType: string;
    normalizeAddress(address: string): string;
    challenge(id: string, address: string, nonce: string): { message: string; recipient: string; nonce: string };
    proofFingerprint(proof: unknown): string;
    verify(challenge: WalletLinkChallenge, proof: unknown): Promise<void>;
}

export const WALLET_OWNERSHIP_VERIFIERS = Symbol('WALLET_OWNERSHIP_VERIFIERS');
