import { IsIn, IsString } from 'class-validator';
export class SpendableSwapDto {
    @IsString() sourceAssetId: string;
    @IsString() originAsset: string;
    @IsString() signerId: string;
    @IsString() network: string;
    @IsIn(['near', 'evm', 'ton']) authMethod: 'near' | 'evm' | 'ton';
}
