import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createPublicKey, verify } from 'crypto';
import { WalletLinkChallenge } from '../../database/models/wallet-link-challenge.model';
import { ChainRpcService } from '../balances/rpc/chain-rpc.service';
import { ChainRpcRequestError } from '../balances/rpc/chain-rpc.types';
import { WalletOwnershipVerifier } from './wallet-ownership-verifier';

const RECIPIENT = 'craftscript.com';
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

type NearWalletProof = { publicKey: string; signature: string };

function parseProof(proof: unknown): NearWalletProof {
    if (!proof || typeof proof !== 'object' || Array.isArray(proof)) {
        throw new BadRequestException('NEAR wallet proof is required');
    }
    const publicKey = Reflect.get(proof, 'publicKey');
    const signature = Reflect.get(proof, 'signature');
    if (typeof publicKey !== 'string' || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{40,60}$/.test(publicKey)) {
        throw new BadRequestException('Invalid NEAR public key');
    }
    if (typeof signature !== 'string' || signature.length > 128 || signature.length === 0) {
        throw new BadRequestException('Invalid NEAR wallet signature');
    }
    return { publicKey, signature };
}

function decodeBase58(value: string): Buffer {
    let number = 0n;
    for (const character of value) {
        const digit = BASE58_ALPHABET.indexOf(character);
        if (digit < 0) throw new BadRequestException('Invalid NEAR public key');
        number = number * 58n + BigInt(digit);
    }
    const bytes: number[] = [];
    while (number > 0n) {
        bytes.unshift(Number(number & 255n));
        number >>= 8n;
    }
    return Buffer.from([...Array(value.match(/^1*/)?.[0].length ?? 0).fill(0), ...bytes]);
}

function borshString(value: string): Buffer {
    const bytes = Buffer.from(value, 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32LE(bytes.length);
    return Buffer.concat([length, bytes]);
}

export function verifyNearWalletLinkSignature(input: {
    message: string;
    nonce: string;
    signature: string;
    publicKey: string;
}): boolean {
    if (!input.publicKey.startsWith('ed25519:')) return false;
    const keyBytes = decodeBase58(input.publicKey.slice('ed25519:'.length));
    const nonce = Buffer.from(input.nonce, 'base64');
    const signature = Buffer.from(input.signature, 'base64');
    if (keyBytes.length !== 32 || nonce.length !== 32 || signature.length !== 64) return false;
    const tag = Buffer.alloc(4);
    tag.writeUInt32LE(0x80000000 + 413);
    const payload = Buffer.concat([tag, borshString(input.message), nonce, borshString(RECIPIENT), Buffer.from([0])]);
    const digest = createHash('sha256').update(payload).digest();
    const publicKey = createPublicKey({
        key: Buffer.concat([ED25519_SPKI_PREFIX, keyBytes]),
        format: 'der',
        type: 'spki',
    });
    return verify(null, digest, publicKey, signature);
}

@Injectable()
export class NearWalletProofVerifier implements WalletOwnershipVerifier {
    readonly chainType = 'near';
    readonly proofType = 'nep413';

    constructor(private readonly chainRpc: ChainRpcService) {}

    normalizeAddress(address: string): string {
        const account = address.trim().toLowerCase();
        if (!/^[a-z0-9._-]+\.(?:near|tg)$/.test(account) || account.length > 64) {
            throw new BadRequestException('A valid NEAR mainnet account is required');
        }
        return account;
    }

    challenge(id: string, address: string, nonce: string) {
        return {
            message: `Link NEAR wallet ${address} to CraftScript account. Challenge: ${id}`,
            recipient: RECIPIENT,
            nonce,
        };
    }

    proofFingerprint(proof: unknown): string {
        const parsed = parseProof(proof);
        return createHash('sha256').update(`${parsed.publicKey}\u0000${parsed.signature}`).digest('hex');
    }

    async verify(challenge: WalletLinkChallenge, proof: unknown): Promise<void> {
        const parsed = parseProof(proof);
        if (
            !verifyNearWalletLinkSignature({
                ...this.challenge(challenge.id, challenge.address, challenge.nonce),
                ...parsed,
            })
        ) {
            throw new ForbiddenException('Invalid NEAR wallet ownership signature');
        }
        let accessKey: { permission?: unknown };
        try {
            ({ result: accessKey } = await this.chainRpc.request<{ permission?: unknown }>('near:mainnet', 'query', {
                request_type: 'view_access_key',
                finality: 'final',
                account_id: challenge.address,
                public_key: parsed.publicKey,
            }));
        } catch (error) {
            if (error instanceof ChainRpcRequestError && !error.retryable) {
                throw new ForbiddenException('NEAR account does not authorize this access key');
            }
            throw new ServiceUnavailableException('Unable to verify the NEAR account access key');
        }
        if (accessKey?.permission !== 'FullAccess') {
            throw new ForbiddenException('NEAR wallet proof requires a current full-access key');
        }
    }
}
