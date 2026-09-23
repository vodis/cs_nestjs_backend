export const SWAP_WALLET_AUTHORIZATION = Symbol('SWAP_WALLET_AUTHORIZATION');

export interface SwapWalletAuthorizationPort {
    isOwnedByUser(userId: string, address: string, chainType: 'evm' | 'near'): Promise<boolean>;
}
