import { providerPools, PUBLIC_BALANCE_CHAINS } from './rpc/provider-config';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { balanceNetworkForBlockchain, isNativeBalanceRoute } from '@vodis/cs-assets/one-click';
import { isAxiosError } from 'axios';
import { decodeBase58, toBeArray, id } from 'ethers';
import { createHash } from 'crypto';
import { AssetDto } from '../assets/dto/get-assets-response.dto';
import { formatTokenAmount } from '../../utils/decimal.util';
import { SwapAddressValidationService } from '../../modules/swaps/domain/services/swap-address-validation.service';
import { RpcUnavailableException } from './rpc/chain-rpc.types';
import type { BalanceAccount, ChainBalanceBatchResult, LiveChainBalance } from './chain-balance.service';

// These adapters only read holdings. They do not implement funding or grant wallet ownership.
const READERS = PUBLIC_BALANCE_CHAINS;
const BLOCKCHAIR: Record<string, string> = {
    bch: 'bitcoin-cash',
    dash: 'dash',
    doge: 'dogecoin',
    ltc: 'litecoin',
    zec: 'zcash',
};
type ObjectData = Record<string, unknown>;
type Endpoint = { alias: string; url: string };

function object(value: unknown): ObjectData {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid provider object');
    return value as ObjectData;
}
function rows(value: unknown): ObjectData[] {
    if (!Array.isArray(value)) throw new Error('Invalid provider list');
    return value.map(object);
}
export function atomicBalance(value: unknown): string {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('Invalid atomic balance');
    return BigInt(value).toString();
}
export function decimalBalance(value: unknown, decimals: number): string {
    if (
        typeof value !== 'string' ||
        !/^\d+(\.\d+)?$/.test(value) ||
        !Number.isInteger(decimals) ||
        decimals < 0 ||
        decimals > 255
    )
        throw new Error('Invalid decimal balance');
    const [whole, fraction = ''] = value.split('.');
    if (/[1-9]/.test(fraction.slice(decimals))) throw new Error('Balance precision exceeds asset decimals');
    return BigInt(whole + fraction.slice(0, decimals).padEnd(decimals, '0')).toString();
}

@Injectable()
export class PublicChainBalancesService {
    private readonly pending = new Map<string, Promise<unknown>>();
    private readonly cooldown = new Map<string, number>();
    constructor(
        private readonly config: ConfigService,
        private readonly http: HttpService,
    ) {}

    assertAddress(network: string, address: string): void {
        const chain = this.chain(network);
        if (!READERS.has(chain)) return; // No provider read or ownership assertion for unsupported/private state.
        try {
            new SwapAddressValidationService().assertExternalRecipient(address, 'DESTINATION_CHAIN', chain);
        } catch {
            throw new BadRequestException('Invalid balance address for network');
        }
        if (chain === 'tron') {
            const bytes = Buffer.from(toBeArray(decodeBase58(address)));
            const checksum = createHash('sha256')
                .update(createHash('sha256').update(bytes.subarray(0, 21)).digest())
                .digest()
                .subarray(0, 4);
            if (bytes.length !== 25 || bytes[0] !== 0x41 || !bytes.subarray(21).equals(checksum))
                throw new BadRequestException('Invalid TRON address checksum');
        }
        // XRP tags/X-addresses select a deposit recipient, not a separate balance account.
        if (chain === 'xrp' && !address.startsWith('r'))
            throw new BadRequestException('Use an XRP classic account address');
    }

    async getBalances(
        wallet: BalanceAccount,
        network: string,
        assets: Array<AssetDto | undefined>,
    ): Promise<ChainBalanceBatchResult> {
        const chain = this.chain(network);
        this.assertAddress(network, wallet.address);
        if (
            assets.some(
                (asset) =>
                    !asset || asset.blockchain !== chain || balanceNetworkForBlockchain(asset.blockchain) !== network,
            )
        )
            throw new BadRequestException('Explicit registered assets on the requested network are required');
        const balances: LiveChainBalance[] = [];
        const failures: ChainBalanceBatchResult['failures'] = [];
        // Bound provider concurrency; account-level reads are shared within this request.
        const memo = new Map<string, Promise<unknown>>();
        const deadline = Date.now() + 8000;
        let endpoints: Endpoint[] | undefined;
        for (const asset of assets as AssetDto[]) {
            try {
                if (!READERS.has(chain))
                    throw new RpcUnavailableException(
                        network,
                        ['aleo', 'miden'].includes(chain) ? 'BALANCE_WALLET_REQUIRED' : 'BALANCE_UNSUPPORTED',
                        ['aleo', 'miden'].includes(chain)
                            ? 'Complete balances require wallet-assisted access on this network.'
                            : 'Balance reads are not yet supported on this network.',
                    );
                endpoints ??= this.endpoints(chain, network);
                let result: { raw: string; alias: string } | undefined;
                for (const endpoint of endpoints) {
                    if ((this.cooldown.get(endpoint.url) ?? 0) > Date.now()) continue;
                    try {
                        const raw = await this.readAsset(chain, endpoint, wallet.address, asset, memo, deadline);
                        result = { raw, alias: endpoint.alias };
                        break;
                    } catch (error) {
                        if (isAxiosError(error) && error.response?.status === 429)
                            this.cooldown.set(endpoint.url, Date.now() + 60_000);
                    }
                }
                if (!result) throw this.unavailable(network, 'Balance providers are unavailable or rate limited');
                const fetchedAt = new Date();
                balances.push({
                    network,
                    assetId: asset.balanceAssetId ?? asset.assetId,
                    symbol: asset.symbol,
                    decimals: asset.decimals,
                    balanceRaw: result.raw,
                    balanceDecimal: formatTokenAmount(result.raw, asset.decimals),
                    source: 'public_chain_api',
                    providerAlias: result.alias,
                    fetchedAt,
                    expiresAt: new Date(fetchedAt.getTime() + 30_000),
                });
            } catch (error) {
                const issue =
                    error instanceof RpcUnavailableException
                        ? error
                        : this.unavailable(network, 'Balance data could not be verified');
                failures.push({ assetId: asset.assetId, reason: issue.message, rpcIssue: issue });
            }
        }
        return { balances, failures };
    }

    private chain(network: string): string {
        const chain = network.startsWith('oneclick:') ? network.slice(9) : '';
        if (!chain || balanceNetworkForBlockchain(chain) !== network)
            throw new BadRequestException('Unsupported balance network');
        return chain;
    }
    private unavailable(network: string, message: string): RpcUnavailableException {
        return new RpcUnavailableException(network, 'RPC_UNAVAILABLE', message);
    }
    private endpoints(chain: string, network: string): Endpoint[] {
        const centralized = providerPools(this.config)?.get(network);
        if (centralized) return centralized;
        let config: ObjectData;
        try {
            config = object(JSON.parse(this.config.get<string>('BALANCE_PROVIDERS_JSON') || '{}'));
        } catch {
            throw this.unavailable(network, 'Invalid balance provider configuration');
        }
        const value = config[chain];
        if (!value)
            throw new RpcUnavailableException(
                network,
                'RPC_NOT_CONFIGURED',
                'Balance access is not configured for this network',
            );
        if (!Array.isArray(value) || value.length < 1 || value.length > 4)
            throw this.unavailable(network, 'Invalid balance provider configuration');
        return value.map((item) => {
            const entry = object(item);
            if (
                typeof entry.alias !== 'string' ||
                !/^[a-z][a-z0-9-]{0,31}$/.test(entry.alias) ||
                typeof entry.url !== 'string'
            )
                throw new Error('Invalid provider');
            const url = new URL(entry.url);
            if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
                throw new Error('Invalid provider URL');
            return { alias: entry.alias, url: entry.url.replace(/\/$/, '') };
        });
    }
    private async request(endpoint: Endpoint, path: string, body: unknown, deadline: number): Promise<unknown> {
        const key = JSON.stringify([endpoint.url, path, body]);
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error('Balance deadline exceeded');
        const current = this.pending.get(key);
        if (current) return current;
        const work = this.http.axiosRef
            .request<unknown>({
                url: endpoint.url + path,
                method: body === undefined ? 'GET' : 'POST',
                data: body,
                timeout: Math.min(4000, remaining),
                maxRedirects: 0,
                maxContentLength: 2_000_000,
            })
            .then((response) => response.data);
        this.pending.set(key, work);
        try {
            return await work;
        } finally {
            this.pending.delete(key);
        }
    }
    private async readAsset(
        chain: string,
        endpoint: Endpoint,
        address: string,
        asset: AssetDto,
        memo: Map<string, Promise<unknown>>,
        deadline: number,
    ): Promise<string> {
        const read = (path: string, body?: unknown): Promise<unknown> => {
            const key = JSON.stringify([endpoint.url, path, body]);
            let promise = memo.get(key);
            if (!promise) {
                promise = this.request(endpoint, path, body, deadline);
                memo.set(key, promise);
            }
            return promise;
        };
        const native = !asset.contractAddress && isNativeBalanceRoute(chain, asset.defuseAssetId);
        if (!native && !asset.contractAddress) throw new Error('Unrecognized token identity');
        const rpc = async (method: string, params: unknown): Promise<unknown> => {
            const response = object(await read('', { jsonrpc: '2.0', id: 1, method, params }));
            if (response.error || response.id !== 1 || !Object.prototype.hasOwnProperty.call(response, 'result'))
                throw new Error('Invalid JSON-RPC result');
            return response.result;
        };
        if (chain === 'fogo') {
            if (!native || asset.decimals !== 9) throw new Error('Unsupported Fogo asset');
            if ((await rpc('getGenesisHash', [])) !== 'CDLtwKnaCoK157uaHQDj4fHu72AyD2519Cphmpiq6hvT')
                throw new Error('Wrong Fogo network');
            return atomicBalance(object(await rpc('getBalance', [address, { commitment: 'finalized' }])).value);
        }
        if (chain === 'starknet') {
            if ((await rpc('starknet_chainId', [])) !== '0x534e5f4d41494e') throw new Error('Wrong Starknet network');
            const contract = native
                ? '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'
                : asset.contractAddress!;
            if (!/^0x[0-9a-fA-F]{1,64}$/.test(contract)) throw new Error('Invalid Starknet contract');
            const result = await rpc('starknet_call', {
                request: {
                    contract_address: contract,
                    entry_point_selector: '0x' + (BigInt(id('balanceOf')) & ((1n << 250n) - 1n)).toString(16),
                    calldata: [address],
                },
                block_id: 'latest',
            });
            if (
                !Array.isArray(result) ||
                result.length !== 2 ||
                result.some((v) => typeof v !== 'string' || !/^0x[0-9a-fA-F]+$/.test(v) || BigInt(v) >= 1n << 128n)
            )
                throw new Error('Invalid Cairo u256 balance');
            return (BigInt(result[0]) + (BigInt(result[1]) << 128n)).toString();
        }
        if (chain === 'tron') {
            // Require the mainnet genesis id; a testnet also accepts the same address format.
            const genesis = object(await read('/wallet/getblockbynum', { num: 0 }));
            if (genesis.blockID !== '00000000000000001ebf88508a03865c71d452e25f4d51194196a1d22b6653dc')
                throw new Error('Wrong TRON network');
            if (native) {
                if (asset.decimals !== 6) throw new Error('Invalid TRX decimals');
                const account = object(await read('/walletsolidity/getaccount', { address, visible: true }));
                if (account.Error || (account.address !== undefined && account.address !== address))
                    throw new Error('Invalid TRON account');
                if (!Object.keys(account).length || (account.address === address && account.balance === undefined))
                    return '0';
                return atomicBalance(account.balance);
            }
            if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(asset.contractAddress!)) throw new Error('Invalid TRC20 contract');
            const bytes = toBeArray(decodeBase58(address));
            if (bytes.length !== 25 || bytes[0] !== 0x41) throw new Error('Invalid TRON address');
            const parameter = Buffer.from(bytes.slice(1, 21)).toString('hex').padStart(64, '0');
            const response = object(
                await read('/walletsolidity/triggerconstantcontract', {
                    owner_address: address,
                    contract_address: asset.contractAddress,
                    function_selector: 'balanceOf(address)',
                    parameter,
                    visible: true,
                }),
            );
            const values = response.constant_result;
            if (
                object(response.result).result !== true ||
                !Array.isArray(values) ||
                values.length !== 1 ||
                typeof values[0] !== 'string' ||
                !/^[0-9a-fA-F]{64}$/.test(values[0])
            )
                throw new Error('Invalid TRC20 result');
            return BigInt('0x' + values[0]).toString();
        }
        if (chain === 'stellar') {
            const root = object(await read(''));
            if (root.network_passphrase !== 'Public Global Stellar Network ; September 2015')
                throw new Error('Wrong Stellar network');
            const account = object(await read(`/accounts/${encodeURIComponent(address)}`));
            if (account.account_id !== address) throw new Error('Wrong account');
            const balances = rows(account.balances);
            const identities = new Set<string>();
            for (const row of balances) {
                decimalBalance(row.balance, 7);
                const identity =
                    row.asset_type === 'native'
                        ? 'native'
                        : row.asset_type === 'liquidity_pool_shares' &&
                            typeof row.liquidity_pool_id === 'string' &&
                            /^[0-9a-f]{64}$/.test(row.liquidity_pool_id)
                          ? `pool:${row.liquidity_pool_id}`
                          : ['credit_alphanum4', 'credit_alphanum12'].includes(String(row.asset_type)) &&
                              typeof row.asset_issuer === 'string' &&
                              row.asset_issuer.length > 0 &&
                              typeof row.asset_code === 'string' &&
                              /^[a-zA-Z0-9]{1,12}$/.test(row.asset_code)
                            ? `${row.asset_issuer}:${row.asset_code}`
                            : undefined;
                if (!identity || identities.has(identity)) throw new Error('Invalid Stellar balance list');
                identities.add(identity);
            }
            if (!identities.has('native')) throw new Error('Missing Stellar native balance');
            const matching = balances.filter((row) =>
                native
                    ? row.asset_type === 'native'
                    : row.asset_issuer === asset.contractAddress &&
                      row.asset_code === asset.symbol &&
                      ['credit_alphanum4', 'credit_alphanum12'].includes(String(row.asset_type)),
            );
            if (matching.length > 1 || asset.decimals !== 7) throw new Error('Ambiguous Stellar asset');
            // A valid complete account trustline list proves absence; HTTP errors never mean zero.
            return matching.length ? decimalBalance(matching[0].balance, 7) : '0';
        }
        if (chain === 'hypercore') {
            if (!asset.defuseAssetId.startsWith('1cs_v1:hypercore:hip1:'))
                throw new Error('HyperCore route requires an explicit HIP-1 identity');
            const meta = object(await read('/info', { type: 'spotMeta' }));
            const tokens = rows(meta.tokens).filter((token) => token.tokenId === asset.contractAddress);
            if (
                tokens.length !== 1 ||
                tokens[0].weiDecimals !== asset.decimals ||
                !Number.isSafeInteger(tokens[0].index)
            )
                throw new Error('HyperCore token mismatch');
            const state = object(await read('/info', { type: 'spotClearinghouseState', user: address }));
            const balances = rows(state.balances);
            const indexes = new Set<number>();
            for (const row of balances) {
                if (
                    typeof row.token !== 'number' ||
                    !Number.isSafeInteger(row.token) ||
                    row.token < 0 ||
                    indexes.has(row.token) ||
                    typeof row.total !== 'string' ||
                    !/^\d+(\.\d+)?$/.test(row.total)
                )
                    throw new Error('Invalid HyperCore balance list');
                indexes.add(row.token);
            }
            const matching = balances.filter((row) => row.token === tokens[0].index);
            if (matching.length > 1) throw new Error('Ambiguous HyperCore balance');
            return matching.length ? decimalBalance(matching[0].total, asset.decimals) : '0';
        }
        if (chain === 'xrp') {
            if (!native || asset.decimals !== 6) throw new Error('Unsupported XRP asset');
            const info = object(object(await read('', { method: 'server_info', params: [{}] })).result);
            if (object(info.info).network_id !== 0) throw new Error('Wrong XRP network');
            const response = object(
                await read('', {
                    method: 'account_info',
                    params: [{ account: address, ledger_index: 'validated', strict: true }],
                }),
            );
            const result = object(response.result);
            if (result.status !== 'success' || result.validated !== true) throw new Error('Unvalidated XRP account');
            const account = object(result.account_data);
            if (account.Account !== address) throw new Error('Wrong XRP account');
            return atomicBalance(account.Balance);
        }
        if (chain === 'aptos' || chain === 'movement') {
            const ledger = object(await read(''));
            if (ledger.chain_id !== (chain === 'aptos' ? 1 : 126)) throw new Error('Wrong Move network');
            if (native) {
                const result = await read('/view', {
                    function: '0x1::coin::balance',
                    type_arguments: ['0x1::aptos_coin::AptosCoin'],
                    arguments: [address],
                });
                if (!Array.isArray(result) || result.length !== 1) throw new Error('Invalid Move balance');
                return atomicBalance(result[0]);
            }
            if (!/^0x[0-9a-fA-F]{1,64}$/.test(asset.contractAddress!))
                throw new Error('Invalid fungible asset metadata');
            const result = await read('/view', {
                function: '0x1::primary_fungible_store::balance',
                type_arguments: ['0x1::fungible_asset::Metadata'],
                arguments: [address, asset.contractAddress],
            });
            if (!Array.isArray(result) || result.length !== 1) throw new Error('Invalid Move balance');
            return atomicBalance(result[0]);
        }
        if (chain === 'sui') {
            const identity = object(await read('', { query: '{ chainIdentifier }' }));
            if (
                identity.errors ||
                object(identity.data).chainIdentifier !== '4btiuiMPvEENsttpZC7CZ53DruC3MAgfznDbASZ7DR6S'
            )
                throw new Error('Wrong Sui network');
            const coinType = native ? '0x2::sui::SUI' : asset.contractAddress!;
            if (!/^0x[0-9a-fA-F]{1,64}::[a-zA-Z_][a-zA-Z0-9_]*::[a-zA-Z_][a-zA-Z0-9_]*$/.test(coinType))
                throw new Error('Invalid Sui coin type');
            const response = object(
                await read('', {
                    query:
                        'query Balance($address: SuiAddress!, $coin: String!) {' +
                        ' address(address: $address) { balance(coinType: $coin) { totalBalance } } }',
                    variables: { address, coin: coinType },
                }),
            );
            if (response.errors) throw new Error('Sui query failed');
            return atomicBalance(object(object(object(response.data).address).balance).totalBalance);
        }
        if (chain === 'cardano') {
            if (!native || asset.decimals !== 6) throw new Error('Unsupported Cardano asset');
            const genesis = rows(await read('/genesis'));
            if (genesis.length !== 1 || String(genesis[0].networkmagic) !== '764824073')
                throw new Error('Wrong Cardano network');
            const accounts = rows(await read('/address_info', { _addresses: [address] }));
            if (accounts.length !== 1 || accounts[0].address !== address)
                throw new Error('Incomplete Cardano account response');
            return atomicBalance(accounts[0].balance);
        }
        if (Object.prototype.hasOwnProperty.call(BLOCKCHAIR, chain)) {
            if (!native || asset.decimals !== 8) throw new Error('Unsupported Bitcoin-family asset');
            const response = object(
                await read(`/${BLOCKCHAIR[chain]}/dashboards/address/${encodeURIComponent(address)}`),
            );
            if (object(response.context).code !== 200) throw new Error('Blockchair request failed');
            const entry = object(object(response.data)[address]);
            return atomicBalance(object(entry.address).balance);
        }
        throw new Error('No balance reader');
    }
}
