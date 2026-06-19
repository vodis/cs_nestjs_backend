import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, Matches } from 'class-validator';
import { ValidateNested } from 'class-validator';

export class PrivyWalletDto {
    @IsOptional()
    @IsString()
    privyWalletId?: string;

    @IsString()
    @Matches(/^0x[a-fA-F0-9]{40}$/)
    address: string;

    @IsOptional()
    @IsString()
    chainType?: string;

    @IsOptional()
    @IsString()
    walletType?: string;

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
