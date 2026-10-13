import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { SOLANA_MAINNET } from '../assets/native-asset-routes';
import { Test } from '@nestjs/testing';
import { Keypair } from '@solana/web3.js';
import { SolanaFundingService } from './solana-funding.service';
import { ChainRpcService } from './rpc/chain-rpc.service';

describe('Solana funding preparation', () => {
    const sender = Keypair.generate().publicKey.toBase58();
    const destination = Keypair.generate().publicKey.toBase58();
    const blockhash = Keypair.generate().publicKey.toBase58();
    const request = jest.fn();
    let service: SolanaFundingService;
    let balance: number;
    beforeEach(async () => {
        balance = 100000;
        request.mockReset().mockImplementation(async (network: string, method: string) => {
            expect(network).toBe(SOLANA_MAINNET);
            const responses: Record<string, unknown> = {
                getLatestBlockhash: { value: { blockhash, lastValidBlockHeight: 123 } },
                getBlockHeight: 1,
                getBalance: { value: balance },
                getFeeForMessage: { value: 5000 },
                getAccountInfo: { value: null },
            };
            return { result: responses[method], providerAlias: 'test' };
        });
        const module = await Test.createTestingModule({
            providers: [SolanaFundingService, { provide: ChainRpcService, useValue: { request } }],
        }).compile();
        service = module.get(SolanaFundingService);
    });
    it('binds a recent blockhash and checks native funds plus the actual message fee', async () => {
        await expect(service.prepare(sender, destination, '95000', 9)).resolves.toMatchObject({
            blockhash,
            lastValidBlockHeight: 123,
        });
        balance = 99999;
        await expect(service.prepare(sender, destination, '95000', 9)).rejects.toThrow('Insufficient SOL');
    });
    it('rejects overflow and unregistered token programs instead of treating them as SOL', async () => {
        await expect(service.prepare(sender, destination, '18446744073709551616', 9)).rejects.toThrow('amount');
        await expect(
            service.prepare(sender, destination, '1', 6, Keypair.generate().publicKey.toBase58()),
        ).rejects.toThrow('Unsupported SPL');
    });
    it('treats a missing associated token account as zero balance', async () => {
        expect(await service.tokenBalance(sender, Keypair.generate().publicKey.toBase58())).toBe('0');
    });
    it('validates a legacy SPL mint, token funds and rent before returning token metadata', async () => {
        const mint = Keypair.generate().publicKey.toBase58();
        request.mockImplementation(async (_network: string, method: string, params: unknown[]) => {
            const responses: Record<string, unknown> = {
                getLatestBlockhash: { value: { blockhash, lastValidBlockHeight: 123 } },
                getBlockHeight: 1,
                getBalance: { value: 10000000 },
                getFeeForMessage: { value: 5000 },
                getMinimumBalanceForRentExemption: 2039280,
                getAccountInfo:
                    params[0] === mint
                        ? { value: { owner: TOKEN_PROGRAM_ID.toBase58(), data: { parsed: { info: { decimals: 6 } } } } }
                        : { value: { data: { parsed: { info: { tokenAmount: { amount: '146146' } } } } } },
            };
            return { result: responses[method], providerAlias: 'test' };
        });
        await expect(service.prepare(sender, destination, '146146', 6, mint)).resolves.toMatchObject({
            blockhash,
            tokenDecimals: 6,
        });
        await expect(service.prepare(sender, destination, '146147', 6, mint)).rejects.toThrow('Insufficient SPL');
        await expect(service.prepare(sender, destination, '1', 9, mint)).rejects.toThrow('decimals');
    });
});
