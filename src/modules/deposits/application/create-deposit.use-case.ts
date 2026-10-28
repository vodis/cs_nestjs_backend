import { ConflictException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DepositInstructions, DepositProvider, DepositWalletSource } from './deposit.ports';

@Injectable()
export class CreateDepositUseCase {
    private readonly pending = new Map<string, Promise<DepositInstructions>>();

    constructor(
        private readonly wallets: DepositWalletSource,
        private readonly provider: DepositProvider,
    ) {}

    async execute(userId: string, walletId: string, assetId: string, amount: string): Promise<DepositInstructions> {
        const wallet = await this.wallets.selected(userId);
        if (!wallet || wallet.id !== walletId) throw new ConflictException('Select an active linked wallet');
        const key = JSON.stringify([userId, walletId, wallet.address, assetId, amount]);
        const existing = this.pending.get(key);
        if (existing) return existing;
        if (this.pending.size >= 100)
            throw new HttpException('Deposit requests are busy', HttpStatus.TOO_MANY_REQUESTS);
        const request = this.provider.create(wallet, assetId, amount).then(async (instructions) => {
            const current = await this.wallets.selected(userId);
            if (current?.id !== walletId || current.address !== wallet.address)
                throw new ConflictException('Selected wallet changed; request new deposit instructions');
            return instructions;
        });
        this.pending.set(key, request);
        try {
            return await request;
        } finally {
            this.pending.delete(key);
        }
    }
}
