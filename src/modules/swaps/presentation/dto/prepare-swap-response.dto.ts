import { ApiProperty } from '@nestjs/swagger';

export class SwapIntentDto {
    @ApiProperty({ example: 'token_diff' })
    intent: 'token_diff';

    @ApiProperty({
        example: {
            'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near': '-1000000',
            'nep141:wrap.near': '250000000000000000000000',
        },
    })
    diff: Record<string, string>;
}

export class ApprovedPreparePackageDto {
    @ApiProperty({ type: [String], example: ['0xabc123'] })
    quoteHashes: string[];

    @ApiProperty({
        example: {
            'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near': '-1000000',
            'nep141:wrap.near': '250000000000000000000000',
        },
    })
    tokenDeltas: Record<string, string>;

    @ApiProperty({ type: [SwapIntentDto] })
    intents: SwapIntentDto[];

    @ApiProperty({ example: '0x380b8fa1ebfe8a652dbb55c5a7dec2c683bbd8b9' })
    signerId: string;

    @ApiProperty({ example: '2026-06-11T12:00:00.000Z' })
    deadline: string;

    @ApiProperty({ example: 'evm', enum: ['evm', 'near'] })
    authMethod: 'evm' | 'near';

    @ApiProperty({ example: 'erc191', enum: ['erc191', 'nep413'] })
    signatureStandard: 'erc191' | 'nep413';

    @ApiProperty()
    originAsset: string;

    @ApiProperty()
    destinationAsset: string;

    @ApiProperty()
    amountIn: string;

    @ApiProperty()
    amountOut: string;

    @ApiProperty()
    slippageTolerance: number;

    @ApiProperty()
    quoteExpiration: string;

    @ApiProperty({ example: 'solver-relay' })
    providerId: string;
}

export class PrepareSwapResponseDto {
    @ApiProperty({ type: ApprovedPreparePackageDto })
    data: ApprovedPreparePackageDto;
}
