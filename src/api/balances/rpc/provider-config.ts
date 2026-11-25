import { ConfigService } from '@nestjs/config';
import { BITCOIN_MAINNET } from '@vodis/cs-assets';
import { parseSupportedChainNetwork } from '../../../utils/chain-network.util';
import { ChainRpcEndpoint } from './chain-rpc.types';

export const PUBLIC_BALANCE_CHAINS = new Set([
    'fogo',
    'starknet',
    'tron',
    'stellar',
    'hypercore',
    'xrp',
    'aptos',
    'movement',
    'sui',
    'cardano',
    'bch',
    'dash',
    'doge',
    'ltc',
    'zec',
]);
const ALIAS_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
function isProviderNetwork(network: string): boolean {
    return (
        !!parseSupportedChainNetwork(network) ||
        network === BITCOIN_MAINNET ||
        ['ton:mainnet', 'ton:testnet'].includes(network) ||
        (network.startsWith('oneclick:') && PUBLIC_BALANCE_CHAINS.has(network.slice(9)))
    );
}

/** Canonical endpoint configuration. Absence permits migration fallbacks; invalid data never does. */
export function providerPools(config: ConfigService): Map<string, ChainRpcEndpoint[]> | undefined {
    const raw = config.get<string>('CHAIN_RPC_ENDPOINTS_JSON')?.trim();
    if (!raw) return undefined;
    const production = config.get<string>('NODE_ENV') === 'production';
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('CHAIN_RPC_ENDPOINTS_JSON must be valid JSON');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('CHAIN_RPC_ENDPOINTS_JSON must be an object keyed by balance network');
    }

    const result = new Map<string, ChainRpcEndpoint[]>();
    for (const [network, value] of Object.entries(parsed)) {
        if (
            !isProviderNetwork(network) ||
            !Array.isArray(value) ||
            value.length === 0 ||
            value.length > (network === BITCOIN_MAINNET || network.startsWith('ton:') ? 1 : 4)
        ) {
            throw new Error(`Invalid RPC endpoint list for ${network}`);
        }
        const endpoints = value.map((candidate) => parseEndpoint(network, candidate, production));
        if (new Set(endpoints.map((endpoint) => endpoint.alias)).size !== endpoints.length) {
            throw new Error(`RPC endpoint aliases must be unique for ${network}`);
        }
        result.set(network, endpoints);
    }
    if (result.size === 0) throw new Error('CHAIN_RPC_ENDPOINTS_JSON must configure at least one network');
    return result;
}

function parseEndpoint(network: string, candidate: unknown, production: boolean): ChainRpcEndpoint {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new Error(`Invalid RPC endpoint for ${network}`);
    }
    const alias = Reflect.get(candidate, 'alias');
    const url = Reflect.get(candidate, 'url');
    if (typeof alias !== 'string' || !ALIAS_PATTERN.test(alias) || typeof url !== 'string') {
        throw new Error(`Invalid RPC endpoint for ${network}`);
    }
    const jsonRpc = !!parseSupportedChainNetwork(network);
    const parsedUrl = validateProviderUrl(url, production || !jsonRpc);
    if (!jsonRpc && (parsedUrl.search || parsedUrl.hash))
        throw new Error('Provider roots must not contain queries or fragments');
    return { alias, url: jsonRpc ? url : url.replace(/\/$/, '') };
}

export function validateProviderUrl(value: string, production: boolean): URL {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error('RPC endpoint URL is invalid');
    }
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(localHttp && !production)) {
        throw new Error('RPC endpoint URLs must use HTTPS outside local development');
    }
    if (url.username || url.password) throw new Error('RPC endpoint URLs must not use basic authentication');
    return url;
}
