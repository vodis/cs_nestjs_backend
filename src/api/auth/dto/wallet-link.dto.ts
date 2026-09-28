import { IsDefined, IsObject, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class WalletLinkChallengeDto {
    @IsString()
    @Matches(/^[a-z][a-z0-9]{1,15}$/)
    chainType: string;

    @IsString()
    @MaxLength(128)
    address: string;
}

export class VerifyWalletLinkChallengeDto {
    @IsUUID()
    challengeId: string;

    @IsString()
    @Matches(/^[a-z][a-z0-9]{1,15}$/)
    chainType: string;

    @IsDefined()
    @IsObject()
    proof: Record<string, unknown>;
}
