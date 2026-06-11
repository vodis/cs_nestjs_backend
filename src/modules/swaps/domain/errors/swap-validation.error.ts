export type SwapValidationErrorCode =
    | 'UNSUPPORTED_ASSET'
    | 'UNSUPPORTED_PAIR'
    | 'INVALID_SIGNER'
    | 'INVALID_DEADLINE'
    | 'SLIPPAGE_OUT_OF_RANGE'
    | 'SLIPPAGE_EXCEEDED'
    | 'INSUFFICIENT_LIQUIDITY';

export class SwapValidationError extends Error {
    constructor(
        readonly code: SwapValidationErrorCode,
        message: string,
        readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'SwapValidationError';
    }
}
