// NEAR's structured error must identify this exact token contract. A missing
// wallet, execution failure or unstructured message does not establish zero.
export function isMissingNearTokenContract(error: unknown, contract: string): boolean {
    if (!error || typeof error !== 'object' || !('name' in error) || error.name !== 'HANDLER_ERROR') return false;
    if (!('cause' in error) || !error.cause || typeof error.cause !== 'object') return false;
    const cause = error.cause;
    if (!('name' in cause) || cause.name !== 'UNKNOWN_ACCOUNT') return false;
    if (!('info' in cause) || !cause.info || typeof cause.info !== 'object') return false;
    return 'requested_account_id' in cause.info && cause.info.requested_account_id === contract;
}
