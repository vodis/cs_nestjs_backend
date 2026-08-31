import { parseEvmRpcChainId, parseSupportedChainNetwork } from './chain-network.util';

describe('chain network utilities', () => {
    it.each([
        ['eip155:1', 1n],
        ['eip155:56', 56n],
        ['eip155:8453', 8453n],
        ['eip155:42161', 42161n],
    ])('parses EVM network %s without a fixed chain dependency', (network, chainId) => {
        expect(parseSupportedChainNetwork(network)).toEqual({
            namespace: 'eip155',
            reference: network.slice('eip155:'.length),
            chainId,
        });
    });

    it('parses supported NEAR networks', () => {
        expect(parseSupportedChainNetwork('near:mainnet')).toEqual({ namespace: 'near', reference: 'mainnet' });
        expect(parseSupportedChainNetwork('near:testnet')).toEqual({ namespace: 'near', reference: 'testnet' });
    });

    it.each(['solana:mainnet', 'eip155:', 'eip155:not-a-number', 'near:betanet', 'near:mainnet:extra'])(
        'rejects unsupported or malformed network %s',
        (network) => {
            expect(parseSupportedChainNetwork(network)).toBeUndefined();
        },
    );

    it.each([
        ['0x1', 1n],
        ['0x38', 56n],
        ['0x2105', 8453n],
        ['0xA4B1', 42161n],
    ])('parses EVM RPC chain ID %s', (value, chainId) => {
        expect(parseEvmRpcChainId(value)).toBe(chainId);
    });

    it.each(['1', '0x', '0xz', '', null, 1])('rejects malformed EVM RPC chain ID %p', (value) => {
        expect(parseEvmRpcChainId(value)).toBeUndefined();
    });
});
