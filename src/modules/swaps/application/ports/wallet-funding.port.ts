import type { SwapQuoteCommand } from '../../domain/models/swap-quote-request';
import type { AssetRegistryEntry } from '../../domain/models/asset-registry-entry';
import type { SwapExecutionPackage } from '../../domain/models/swap-quote';

export type WalletFunding = {
    version: '1.0.0';
    kind:
        | 'near-native'
        | 'near-token'
        | 'evm-native'
        | 'evm-token'
        | 'ton-native'
        | 'ton-token'
        | 'solana-native'
        | 'solana-token'
        | 'bitcoin-native';
    network: string;
    assetId: string;
    executionAssetId: string;
    sender: string;
    destination: string;
    amount: string;
    expiresAt?: string;
    blockhash?: string;
    lastValidBlockHeight?: number;
    tokenDecimals?: number;
    feeRate?: number;
    tokenContract?: string;
    depositMemo?: string;
    storageDeposit?: string;
    jettonWallet?: string;
};
export interface WalletFundingPort {
    nativeMaximum(network: string, account: string): Promise<string>;
    prepare(
        command: SwapQuoteCommand,
        asset: AssetRegistryEntry,
        execution: SwapExecutionPackage,
    ): Promise<WalletFunding>;
}
export const WALLET_FUNDING = Symbol('WALLET_FUNDING');
