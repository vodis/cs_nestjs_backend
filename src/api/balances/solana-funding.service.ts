import { SOLANA_MAINNET } from '../assets/native-asset-routes';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import {
    createAssociatedTokenAccountIdempotentInstruction,
    createTransferCheckedInstruction,
    getAssociatedTokenAddressSync,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { ChainRpcService } from './rpc/chain-rpc.service';

@Injectable()
export class SolanaFundingService {
    constructor(private readonly rpc: ChainRpcService) {}

    private async read<T>(method: string, params: unknown[]): Promise<T> {
        return (await this.rpc.request<T>(SOLANA_MAINNET, method, params)).result;
    }

    async nativeBalance(account: string): Promise<bigint> {
        const { value } = await this.read<{ value: number }>('getBalance', [account, { commitment: 'confirmed' }]);
        if (!Number.isSafeInteger(value) || value < 0) throw new ServiceUnavailableException('Invalid Solana balance');
        return BigInt(value);
    }

    async tokenBalance(account: string, mint: string): Promise<string> {
        const ata = getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(account)).toBase58();
        const result = await this.read<{
            value: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } | null;
        }>('getAccountInfo', [ata, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
        if (!result.value) return '0';
        const amount = result.value.data?.parsed?.info?.tokenAmount?.amount;
        if (typeof amount !== 'string' || !/^\d+$/.test(amount))
            throw new ServiceUnavailableException('Invalid SPL token balance');
        return amount;
    }

    async prepare(
        sender: string,
        destination: string,
        amount: string,
        decimals: number,
        mint?: string,
    ): Promise<{ blockhash: string; lastValidBlockHeight: number; tokenDecimals?: number; expiresAt: string }> {
        const value = BigInt(amount);
        if (value <= 0n || value > 18446744073709551615n)
            throw new BadRequestException('Invalid Solana transfer amount');
        const from = new PublicKey(sender);
        const to = new PublicKey(destination);
        const fetchedAt = Date.now();
        const { value: latest } = await this.read<{ value: { blockhash: string; lastValidBlockHeight: number } }>(
            'getLatestBlockhash',
            [{ commitment: 'confirmed' }],
        );
        if (!latest || !Number.isSafeInteger(latest.lastValidBlockHeight))
            throw new ServiceUnavailableException('Invalid Solana blockhash response');
        const height = await this.read<number>('getBlockHeight', [{ commitment: 'confirmed' }]);
        if (!Number.isSafeInteger(height) || latest.lastValidBlockHeight - height < 100)
            throw new ServiceUnavailableException('Solana blockhash is too close to expiry; refresh the quote');
        const tx = new Transaction({ feePayer: from, ...latest });
        let rent = 0n;
        if (mint) {
            const mintKey = new PublicKey(mint);
            const { value: info } = await this.read<{
                value: { owner: string; data: { parsed: { info: { decimals: number } } } } | null;
            }>('getAccountInfo', [mint, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
            if (info?.owner !== TOKEN_PROGRAM_ID.toBase58() || info.data?.parsed?.info?.decimals !== decimals)
                throw new BadRequestException('Unsupported SPL mint or decimals');
            if (BigInt(await this.tokenBalance(sender, mint)) < value)
                throw new BadRequestException('Insufficient SPL token balance');
            const source = getAssociatedTokenAddressSync(mintKey, from);
            const target = getAssociatedTokenAddressSync(mintKey, to, true);
            tx.add(createAssociatedTokenAccountIdempotentInstruction(from, target, to, mintKey));
            tx.add(createTransferCheckedInstruction(source, mintKey, target, from, value, decimals));
            const minimum = await this.read<number>('getMinimumBalanceForRentExemption', [165]);
            if (!Number.isSafeInteger(minimum) || minimum < 0)
                throw new ServiceUnavailableException('Invalid Solana rent estimate');
            rent = BigInt(minimum);
        } else {
            tx.add(SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: value }));
        }
        const [{ value: fee }, balance] = await Promise.all([
            this.read<{ value: number | null }>('getFeeForMessage', [
                tx.serializeMessage().toString('base64'),
                { commitment: 'confirmed' },
            ]),
            this.nativeBalance(sender),
        ]);
        if (fee === null || !Number.isSafeInteger(fee) || fee < 0)
            throw new ServiceUnavailableException('Solana fee estimate unavailable');
        if (balance < (mint ? 0n : value) + rent + BigInt(fee))
            throw new BadRequestException('Insufficient SOL for transfer, rent and fees');
        return {
            ...latest,
            expiresAt: new Date(fetchedAt + 20000).toISOString(),
            ...(mint ? { tokenDecimals: decimals } : {}),
        };
    }
}
