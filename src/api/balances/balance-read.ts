import { ChainRpcBatchItem } from './rpc/chain-rpc.types';

export type BalanceReadOutcome = { status: 'known'; balanceRaw: string } | { status: 'unavailable'; reason: string };

// Only the network adapter may establish zero from a provider error.
export function readBalance(
    item: ChainRpcBatchItem,
    parse: (value: unknown) => string,
    provesZero?: (providerError: unknown) => boolean,
): BalanceReadOutcome {
    try {
        if (item.error) {
            return provesZero?.(item.providerError)
                ? { status: 'known', balanceRaw: '0' }
                : { status: 'unavailable', reason: item.error };
        }
        return { status: 'known', balanceRaw: parse(item.result) };
    } catch (error) {
        return { status: 'unavailable', reason: error instanceof Error ? error.message : 'Invalid RPC balance' };
    }
}
