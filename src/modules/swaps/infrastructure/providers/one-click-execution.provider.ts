import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OneClickApiHttpClient } from '../../../../http-clients/one-click-api/one-click-api.http-client';
import {
    ExecuteSwapCommand,
    ExecuteSwapResult,
    ExecutionProviderPort,
} from '../../application/ports/execution-provider.port';

@Injectable()
export class OneClickExecutionProvider implements ExecutionProviderPort {
    readonly providerId = 'one-click';
    private readonly logger = new Logger(OneClickExecutionProvider.name);

    constructor(private readonly oneClickApiHttpClient: OneClickApiHttpClient) {}

    async execute(command: ExecuteSwapCommand): Promise<ExecuteSwapResult> {
        if (command.executionMode !== 'intent_sign') {
            throw new BadRequestException({
                code: 'UNSUPPORTED_ONE_CLICK_EXECUTION_MODE',
                message: '1Click signed execution requires intent_sign mode',
            });
        }

        const signedData = this.getSignedData(command);
        this.logger.log('Submitting signed 1Click swap intent', {
            traceId: command.traceId,
            providerId: this.providerId,
            userChainType: command.userChainType,
        });

        const result = await this.oneClickApiHttpClient.submitIntent({
            type: 'swap_transfer',
            signedData,
        });
        if (!result.intentHash) {
            throw new BadGatewayException({
                code: 'INVALID_ONE_CLICK_SUBMIT_RESPONSE',
                message: '1Click did not return an intent hash',
            });
        }

        return { intentHash: result.intentHash };
    }

    private getSignedData(command: ExecuteSwapCommand): Record<string, unknown> {
        const generatedIntent = this.asObject(command.executionPayload?.intent);
        const signature = this.asObject(command.signature);
        const wrappedSignedData = this.asObject(signature?.signedData);
        const signedData =
            wrappedSignedData ??
            (signature?.standard ? signature : this.withGeneratedPayload(generatedIntent, signature));

        if (!signedData || !generatedIntent) {
            throw new BadRequestException({
                code: 'MISSING_SIGNATURE',
                message: '1Click execution requires the generated intent and its signature',
            });
        }

        this.assertBoundSignedData(command, generatedIntent, signedData);
        return {
            standard: generatedIntent.standard,
            payload: generatedIntent.payload,
            signature: signedData.signature,
            ...(generatedIntent.standard === 'nep413' ? { public_key: signedData.public_key } : {}),
        };
    }

    private withGeneratedPayload(
        generatedIntent: Record<string, unknown> | undefined,
        signature: Record<string, unknown> | undefined,
    ): Record<string, unknown> | undefined {
        if (!generatedIntent || typeof signature?.signature !== 'string') {
            return undefined;
        }
        return { ...generatedIntent, signature: signature.signature };
    }

    private assertBoundSignedData(
        command: ExecuteSwapCommand,
        generatedIntent: Record<string, unknown>,
        signedData: Record<string, unknown>,
    ): void {
        const expectedStandard = command.userChainType === 'near' ? 'nep413' : 'erc191';
        if (
            generatedIntent.standard !== expectedStandard ||
            signedData.standard !== expectedStandard ||
            !this.payloadsMatch(expectedStandard, generatedIntent.payload, signedData.payload) ||
            typeof signedData.signature !== 'string' ||
            !signedData.signature ||
            (expectedStandard === 'nep413' && (typeof signedData.public_key !== 'string' || !signedData.public_key))
        ) {
            throw new BadRequestException({
                code: 'INVALID_SIGNED_INTENT',
                message: 'Signed intent does not match the approved 1Click payload',
            });
        }

        const message = this.intentMessage(expectedStandard, generatedIntent.payload);
        if (!message || this.signerId(message)?.toLowerCase() !== command.userAddress.toLowerCase()) {
            throw new BadRequestException({
                code: 'SIGNED_INTENT_SIGNER_MISMATCH',
                message: 'Signed intent signer does not match the authorized execution wallet',
            });
        }
    }

    private payloadsMatch(standard: 'nep413' | 'erc191', expected: unknown, actual: unknown): boolean {
        if (standard === 'erc191') {
            return typeof expected === 'string' && actual === expected;
        }
        const expectedPayload = this.asObject(expected);
        const actualPayload = this.asObject(actual);
        if (!expectedPayload || !actualPayload) {
            return false;
        }
        return (
            expectedPayload.message === actualPayload.message &&
            expectedPayload.nonce === actualPayload.nonce &&
            expectedPayload.recipient === actualPayload.recipient &&
            (expectedPayload.callbackUrl ?? null) === (actualPayload.callbackUrl ?? null)
        );
    }

    private intentMessage(standard: 'nep413' | 'erc191', payload: unknown): string | undefined {
        if (standard === 'erc191') {
            return typeof payload === 'string' ? payload : undefined;
        }
        const value = this.asObject(payload)?.message;
        return typeof value === 'string' ? value : undefined;
    }

    private signerId(message: string): string | undefined {
        try {
            const parsed = JSON.parse(message) as Record<string, unknown>;
            return typeof parsed.signer_id === 'string' ? parsed.signer_id : undefined;
        } catch {
            return undefined;
        }
    }

    private asObject(value: unknown): Record<string, unknown> | undefined {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : undefined;
    }
}
