import { IsIn, IsInt, IsString, Matches, Max, Min } from 'class-validator';
export class PreviewSwapDto {
    @IsString() originAsset: string;
    @IsString() destinationAsset: string;
    @Matches(/^[1-9][0-9]{0,77}$/) amount: string;
    @IsIn(['EXACT_INPUT', 'EXACT_OUTPUT']) swapType: 'EXACT_INPUT' | 'EXACT_OUTPUT';
    @IsInt() @Min(0) @Max(10000) slippageTolerance: number;
}
