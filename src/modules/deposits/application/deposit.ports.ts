export interface ReceiveWallet {
    id: string;
    address: string;
    chainType: string;
}

export interface DepositInstructions {
    amount: string;
    minimumReceived: string;
    assetId: string;
    network: string;
    walletId: string;
    recipient: string;
    address: string;
    expiresAt: string;
    memo?: string;
}

export abstract class DepositWalletSource {
    abstract selected(userId: string): Promise<ReceiveWallet | null>;
}

export abstract class DepositProvider {
    abstract create(wallet: ReceiveWallet, assetId: string, amount: string): Promise<DepositInstructions>;
}
