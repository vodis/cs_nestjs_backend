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

export class NearIntentsTokenDeltaDto {
    @ApiProperty({ example: 'nep141:wrap.near' })
    assetId: string;

    @ApiProperty({ example: '-1000000' })
    amount: string;
}

export class SwapExecutionPackageDto {
    @ApiProperty({ example: 'solver-relay' })
    providerId: string;

    @ApiProperty({
        example: 'intent_sign',
        enum: ['intent_sign', 'deposit_address', 'evm_transaction', 'external_redirect'],
    })
    mode: 'intent_sign' | 'deposit_address' | 'evm_transaction' | 'external_redirect';

    @ApiProperty({ example: 'near-intents' })
    protocol: string;

    @ApiProperty({ example: 'sign', enum: ['sign', 'deposit', 'submit_transaction', 'redirect'] })
    requiredAction: 'sign' | 'deposit' | 'submit_transaction' | 'redirect';

    @ApiProperty({
        example: {
            quoteHashes: ['0xabc123'],
            signerId: 'alice.near',
            deadline: '2026-06-11T12:00:00.000Z',
            signatureStandard: 'nep413',
        },
    })
    payload: Record<string, unknown>;
}

export class ApprovedPreparePackageDto {
    @ApiProperty({ example: 'near-intents' })
    protocol: 'near-intents';

    @ApiProperty({ example: 'swap' })
    kind: 'swap';

    @ApiProperty({ type: [String], example: ['0xabc123'] })
    quoteHashes: string[];

    @ApiProperty({ type: [NearIntentsTokenDeltaDto] })
    tokenDeltas: NearIntentsTokenDeltaDto[];

    @ApiProperty({ type: [SwapIntentDto] })
    intents: SwapIntentDto[];

    @ApiProperty({ example: '0x380b8fa1ebfe8a652dbb55c5a7dec2c683bbd8b9' })
    signerId: string;

    @ApiProperty({ example: '2026-06-11T12:00:00.000Z' })
    deadline: string;

    @ApiProperty({ example: 1781188800000 })
    deadlineTimestamp: number;

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

    @ApiProperty({ type: SwapExecutionPackageDto })
    executionPackage: SwapExecutionPackageDto;
}

export class PrepareSwapResponseDto {
    @ApiProperty({ type: ApprovedPreparePackageDto })
    data: ApprovedPreparePackageDto;
}
