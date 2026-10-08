import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Address } from '@ton/core';
import { createHash, createPublicKey, verify } from 'crypto';
import type { WalletOwnershipVerifier } from './wallet-ownership-verifier';
import type { WalletLinkChallenge } from '../../database/models/wallet-link-challenge.model';
import { TonCenterService } from '../balances/ton/ton-center.service';

function parseProof(value: unknown) {
    if (
        !value ||
        typeof value !== 'object' ||
        !('signature' in value) ||
        typeof value.signature !== 'string' ||
        value.signature.length > 128 ||
        !('address' in value) ||
        typeof value.address !== 'string' ||
        !('domain' in value) ||
        typeof value.domain !== 'string' ||
        !('timestamp' in value) ||
        typeof value.timestamp !== 'number' ||
        !Number.isSafeInteger(value.timestamp)
    )
        throw new BadRequestException('Invalid TON ownership proof');
    return { signature: value.signature, address: value.address, domain: value.domain, timestamp: value.timestamp };
}
function sized(value: string): Buffer {
    const bytes = Buffer.from(value);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    return Buffer.concat([length, bytes]);
}
/** TON Connect signData text signatures bind address, manifest domain, time and server challenge. */
export function tonOwnershipDigest(address: string, domain: string, timestamp: number, message: string): Buffer {
    const parsed = Address.parse(address);
    const workchain = Buffer.alloc(4);
    workchain.writeInt32BE(parsed.workChain);
    const time = Buffer.alloc(8);
    time.writeBigUInt64BE(BigInt(timestamp));
    return createHash('sha256')
        .update(
            Buffer.concat([
                Buffer.from([255, 255]),
                Buffer.from('ton-connect/sign-data/'),
                workchain,
                parsed.hash,
                sized(domain),
                time,
                Buffer.from('txt'),
                sized(message),
            ]),
        )
        .digest();
}
@Injectable()
export class TonWalletProofVerifier implements WalletOwnershipVerifier {
    readonly chainType = 'ton';
    readonly proofType = 'ton-connect-sign-data';
    constructor(private readonly ton: TonCenterService) {}
    normalizeAddress(address: string): string {
        try {
            return Address.parse(address).toString({ bounceable: false, testOnly: false });
        } catch {
            throw new BadRequestException('Invalid TON wallet address');
        }
    }
    challenge(id: string, address: string, nonce: string) {
        return {
            message: `Link TON mainnet wallet ${address} to CraftScript account. Challenge: ${id}. Nonce: ${nonce}`,
            recipient: 'craftscript.com',
            nonce,
        };
    }
    proofFingerprint(proof: unknown): string {
        return createHash('sha256')
            .update(JSON.stringify(parseProof(proof)))
            .digest('hex');
    }
    async verify(
        challenge: Pick<WalletLinkChallenge, 'id' | 'address' | 'nonce' | 'expiresAt'>,
        proof: unknown,
    ): Promise<void> {
        const parsed = parseProof(proof);
        if (
            this.normalizeAddress(parsed.address) !== challenge.address ||
            !['wallets.craftscript.com', 'staging-wallets.craftscript.com'].includes(parsed.domain) ||
            parsed.timestamp < Math.floor(challenge.expiresAt.getTime() / 1000) - 300 ||
            parsed.timestamp > Date.now() / 1000 + 30
        )
            throw new ForbiddenException('TON ownership proof context does not match');
        const key = await this.ton.getWalletPublicKey(challenge.address);
        const signature = Buffer.from(parsed.signature, 'base64');
        const publicKey = createPublicKey({
            key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key]),
            format: 'der',
            type: 'spki',
        });
        const digest = tonOwnershipDigest(
            parsed.address,
            parsed.domain,
            parsed.timestamp,
            this.challenge(challenge.id, challenge.address, challenge.nonce).message,
        );
        if (signature.length !== 64 || !verify(null, digest, publicKey, signature))
            throw new ForbiddenException('Invalid TON ownership signature');
    }
}
