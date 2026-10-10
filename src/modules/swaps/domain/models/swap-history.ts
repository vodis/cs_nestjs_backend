export type SwapReceipt = {
    amountIn?: string;
    amountOut?: string;
    refundedAmount?: string;
    transactions: { hash: string; explorerUrl: string }[];
};
export type SwapHistoryDetails = {
    submissionState?: 'AWAITING_APPROVAL' | 'SUBMITTED' | 'CANCELLED';
    receipt?: SwapReceipt;
    sourceAssetId: string;
    destinationAssetId: string;
    sourceSymbol: string;
    destinationSymbol: string;
    sourceDecimals: number;
    destinationDecimals: number;
    amountIn: string;
    amountOut: string;
    network: string;
    destinationNetwork: string;
    recipient: string;
};

export function parseSwapReceipt(value: unknown): SwapReceipt | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const atomic = (input: unknown) => (typeof input === 'string' && /^\d+$/.test(input) ? input : undefined);
    const transactions: SwapReceipt['transactions'] = [];
    for (const key of ['originChainTxHashes', 'destinationChainTxHashes']) {
        const entries: unknown = Reflect.get(value, key);
        if (!Array.isArray(entries)) continue;
        for (const entry of entries.slice(0, 20)) {
            if (
                !entry ||
                typeof entry !== 'object' ||
                typeof entry.hash !== 'string' ||
                typeof entry.explorerUrl !== 'string'
            )
                continue;
            try {
                const url = new URL(entry.explorerUrl);
                if (url.protocol === 'https:' && !url.username && !url.password)
                    transactions.push({ hash: entry.hash.slice(0, 256), explorerUrl: url.href });
            } catch {
                /* An invalid explorer URL is never rendered. */
            }
        }
    }
    return {
        amountIn: atomic(Reflect.get(value, 'amountIn')),
        amountOut: atomic(Reflect.get(value, 'amountOut')),
        refundedAmount: atomic(Reflect.get(value, 'refundedAmount')),
        transactions,
    };
}
