import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ValidateNested } from 'class-validator';
import {
    SUPPORTED_WALLET_CHAIN_TYPES,
    SUPPORTED_WALLET_SOURCES,
    SUPPORTED_WALLET_TYPES,
    WalletChainType,
    WalletSource,
    WalletType,
} from './wallet-binding.dto';

export class PrivyWalletDto {
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

export class PrivySessionDto {
    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    authMethod?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => PrivyWalletDto)
    wallet?: PrivyWalletDto;
}
