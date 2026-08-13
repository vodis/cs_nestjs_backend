import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsIn, IsObject, IsString } from 'class-validator';

export class ExecuteSwapRequestDto {
    @ApiProperty({
        example: {
            standard: 'nep413',
            payload: {
                message: '{"signer_id":"alice.near","deadline":"2026-06-11T12:00:00.000Z","intents":[]}',
                nonce: 'Vij2xgAlKBKzAEiS6N1S/hfrNi8/We0ieTmcMBti1YE=',
                recipient: 'intents.near',
            },
            signature: 'ed25519:...',
            public_key: 'ed25519:...',
        },
    })
    @IsObject()
    signature: Record<string, unknown>;

    @ApiProperty({ type: [String], example: ['0xabc123'] })
    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    quoteHashes: string[];

    @ApiProperty({ example: 'alice.near' })
    @IsString()
    userAddress: string;

    @ApiProperty({ example: 'near', enum: ['evm', 'near'] })
    @IsIn(['evm', 'near'])
    userChainType: 'evm' | 'near';

    @ApiProperty({ example: 'trace-123' })
    @IsString()
    traceId: string;
}
