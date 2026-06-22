import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const SUPPORTED_WALLET_CHAIN_TYPES = ['ethereum', 'evm', 'near'] as const;
export const SUPPORTED_WALLET_TYPES = ['embedded', 'external'] as const;
export const SUPPORTED_WALLET_SOURCES = [
    'privy',
    'metamask',
    'walletconnect',
    'coinbase',
    'near',
    'tonkeeper',
] as const;

export type WalletChainType = (typeof SUPPORTED_WALLET_CHAIN_TYPES)[number];
export type WalletType = (typeof SUPPORTED_WALLET_TYPES)[number];
export type WalletSource = (typeof SUPPORTED_WALLET_SOURCES)[number];

export class BindWalletDto {
    @IsOptional()
    @IsString()
    @MaxLength(128)
    privyWalletId?: string;

    @IsString()
    @MaxLength(128)
    address: string;

    @IsOptional()
    @IsIn(SUPPORTED_WALLET_CHAIN_TYPES)
    chainType?: WalletChainType;

    @IsOptional()
    @IsIn(SUPPORTED_WALLET_TYPES)
    walletType?: WalletType;

    @IsOptional()
    @IsIn(SUPPORTED_WALLET_SOURCES)
    source?: WalletSource;

    @IsOptional()
    @IsBoolean()
    isPrimary?: boolean;
}
