export type SupportedChainNetwork =
    | { namespace: 'near'; reference: 'mainnet' | 'testnet' }
    | { namespace: 'eip155'; reference: string; chainId: bigint };

export function parseSupportedChainNetwork(network: string): SupportedChainNetwork | undefined {
    const [namespace, reference, extra] = network.split(':');
    if (!namespace || !reference || extra !== undefined) return undefined;

    if (namespace === 'near' && (reference === 'mainnet' || reference === 'testnet')) {
        return { namespace, reference };
    }

    if (namespace === 'eip155' && /^\d+$/.test(reference)) {
        return { namespace, reference, chainId: BigInt(reference) };
    }

    return undefined;
}

export function parseEvmRpcChainId(value: unknown): bigint | undefined {
    if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) return undefined;
    return BigInt(value);
}
