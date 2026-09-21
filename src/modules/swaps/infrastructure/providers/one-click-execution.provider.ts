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
        const signedData = command.signature?.signedData ?? command.signature;
        if (!signedData || typeof signedData !== 'object' || Array.isArray(signedData)) {
            throw new BadRequestException({
                code: 'MISSING_SIGNATURE',
                message: '1Click execution requires the signed intent payload',
            });
        }

        return signedData as Record<string, unknown>;
    }
}
