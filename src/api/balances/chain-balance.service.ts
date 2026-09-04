import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssetDto } from '../assets/dto/get-assets-response.dto';
import { WalletLink } from '../../database/models/wallet-link.model';
import { formatTokenAmount } from '../../utils/decimal.util';
import { NEAR_NATIVE_ASSET_ID, NEAR_NATIVE_DECIMALS, NEAR_NATIVE_SYMBOL } from './near-balance.constants';
import { ChainRpcService } from './rpc/chain-rpc.service';
import { TonCenterService } from './ton/ton-center.service';

export type BalanceAccount = Pick<WalletLink, 'address' | 'chainType'>;

export type LiveChainBalance = {
    network: string;
    assetId: string;
    symbol: string;
    decimals: number;
    balanceRaw: string;
    balanceDecimal: string;
    source: 'near_rpc' | 'evm_rpc' | 'toncenter_api';
    providerAlias: string;
    fetchedAt: Date;
    expiresAt: Date;
};

type BalanceRequestSpec = {
    key: string;
    assetId: string;
    symbol: string;
    decimals: number;
    method: string;
    params: unknown;
    source: LiveChainBalance['source'];
    parse: (value: unknown) => string;
};

export type ChainBalanceBatchResult = {
    balances: LiveChainBalance[];
    failures: { assetId: string; reason: string }[];
};

const EVM_NETWORK_BY_BLOCKCHAIN: Record<string, string> = {
    eth: 'eip155:1',
    ethereum: 'eip155:1',
    op: 'eip155:10',
    bsc: 'eip155:56',
    gnosis: 'eip155:100',
    pol: 'eip155:137',
    base: 'eip155:8453',
    arb: 'eip155:42161',
    avax: 'eip155:43114',
    scroll: 'eip155:534352',
};

const EVM_NATIVE_ASSET_BY_NETWORK: Record<string, { symbol: string; decimals: number }> = {
    'eip155:1': { symbol: 'ETH', decimals: 18 },
    'eip155:10': { symbol: 'ETH', decimals: 18 },
    'eip155:56': { symbol: 'BNB', decimals: 18 },
    'eip155:100': { symbol: 'xDAI', decimals: 18 },
    'eip155:137': { symbol: 'POL', decimals: 18 },
    'eip155:8453': { symbol: 'ETH', decimals: 18 },
    'eip155:42161': { symbol: 'ETH', decimals: 18 },
    'eip155:43114': { symbol: 'AVAX', decimals: 18 },
    'eip155:534352': { symbol: 'ETH', decimals: 18 },
};

@Injectable()
export class ChainBalanceService {
    constructor(
        private readonly rpc: ChainRpcService,
        private readonly config: ConfigService,
        private readonly tonCenter: TonCenterService,
    ) {}

    async getBalances(
        wallet: BalanceAccount,
        network: string,
        assets: Array<AssetDto | undefined>,
    ): Promise<ChainBalanceBatchResult> {
        if (network === 'ton:mainnet' || network === 'ton:testnet') {
            return this.getTonBalances(wallet, network, assets);
        }
        const specs = assets.map((asset) => this.requestSpec(wallet, network, asset));
        const response = await this.rpc.requestBatch(
            network,
            specs.map(({ key, method, params }) => ({ key, method, params })),
        );
        const specByKey = new Map(specs.map((spec) => [spec.key, spec]));
        const balances: LiveChainBalance[] = [];
        const failures: ChainBalanceBatchResult['failures'] = [];

        for (const item of response.items) {
            const spec = specByKey.get(item.key);
            if (!spec) continue;
            if (item.error) {
                failures.push({ assetId: spec.assetId, reason: item.error });
                continue;
            }
            try {
                balances.push(this.result(network, spec, spec.parse(item.result), response.providerAlias));
            } catch (error) {
                failures.push({
                    assetId: spec.assetId,
                    reason: error instanceof Error ? error.message : 'Invalid RPC balance',
                });
            }
        }
        return { balances, failures };
    }

    assertAddress(network: string, address: string): void {
        if (network.startsWith('near:')) return this.assertNearAccount(address);
        if (network.startsWith('eip155:')) return this.assertEvmAccount(address);
        if (network === 'ton:mainnet' || network === 'ton:testnet') return this.assertTonAccount(address);
        throw new BadRequestException(`Unsupported balance network: ${network}`);
    }

    private requestSpec(wallet: BalanceAccount, network: string, asset?: AssetDto): BalanceRequestSpec {
        if (network.startsWith('near:')) return this.nearRequest(wallet, asset);
        if (network.startsWith('eip155:')) return this.evmRequest(wallet, network, asset);
        throw new BadRequestException(`Unsupported balance network: ${network}`);
    }

    private nearRequest(wallet: BalanceAccount, asset?: AssetDto): BalanceRequestSpec {
        this.assertNearAccount(wallet.address);
        if (!asset || asset.assetId === NEAR_NATIVE_ASSET_ID) {
            return {
                key: NEAR_NATIVE_ASSET_ID,
                assetId: NEAR_NATIVE_ASSET_ID,
                symbol: NEAR_NATIVE_SYMBOL,
                decimals: NEAR_NATIVE_DECIMALS,
                method: 'query',
                params: {
                    request_type: 'view_account',
                    finality: 'final',
                    account_id: wallet.address,
                },
                source: 'near_rpc',
                parse: (value) => this.nearNativeAmount(value),
            };
        }

        const contract = this.nep141Contract(asset);
        return {
            key: asset.assetId,
            assetId: asset.assetId,
            symbol: asset.symbol,
            decimals: asset.decimals,
            method: 'query',
            params: {
                request_type: 'call_function',
                finality: 'final',
                account_id: contract,
                method_name: 'ft_balance_of',
                args_base64: Buffer.from(JSON.stringify({ account_id: wallet.address })).toString('base64'),
            },
            source: 'near_rpc',
            parse: (value) => this.nearFunctionAmount(value),
        };
    }

    private evmRequest(wallet: BalanceAccount, network: string, asset?: AssetDto): BalanceRequestSpec {
        const address = wallet.address.toLowerCase();
        this.assertEvmAccount(address);
        if (!asset) return this.evmNativeRequest(address, network);

        this.assertEvmAssetNetwork(asset, network);
        const contract = asset.contractAddress?.toLowerCase();
        if (!contract || !/^0x[a-f0-9]{40}$/.test(contract)) {
            throw new BadRequestException('EVM token asset requires a valid contract address');
        }
        return {
            key: asset.assetId,
            assetId: asset.assetId,
            symbol: asset.symbol,
            decimals: asset.decimals,
            method: 'eth_call',
            params: [{ to: contract, data: `0x70a08231${address.slice(2).padStart(64, '0')}` }, 'latest'],
            source: 'evm_rpc',
            parse: (value) => this.evmQuantity(value),
        };
    }

    private async getTonBalances(
        wallet: BalanceAccount,
        network: string,
        assets: Array<AssetDto | undefined>,
    ): Promise<ChainBalanceBatchResult> {
        this.assertTonAccount(wallet.address);
        const requests = assets.map(async (asset): Promise<LiveChainBalance> => {
            if (!asset) {
                return this.tonResult(
                    network,
                    'ton:native',
                    'TON',
                    9,
                    await this.tonCenter.getNativeBalance(network, wallet.address),
                );
            }
            if (asset.blockchain.toLowerCase() !== 'ton') {
                throw new BadRequestException('Asset is not supported on the requested TON network');
            }
            const master = asset.contractAddress?.trim();
            if (!master) throw new BadRequestException('TON Jetton asset requires a master contract address');
            this.assertTonAccount(master);
            return this.tonResult(
                network,
                asset.assetId,
                asset.symbol,
                asset.decimals,
                await this.tonCenter.getJettonBalance(network, wallet.address, master),
            );
        });
        const settled = await Promise.allSettled(requests);
        const balances: LiveChainBalance[] = [];
        const failures: ChainBalanceBatchResult['failures'] = [];
        settled.forEach((result, index) => {
            if (result.status === 'fulfilled') balances.push(result.value);
            else {
                if (result.reason instanceof BadRequestException) throw result.reason;
                failures.push({
                    assetId: assets[index]?.assetId || 'ton:native',
                    reason: result.reason instanceof Error ? result.reason.message : 'TON provider request failed',
                });
            }
        });
        return { balances, failures };
    }

    private tonResult(
        network: string,
        assetId: string,
        symbol: string,
        decimals: number,
        balanceRaw: string,
    ): LiveChainBalance {
        const fetchedAt = new Date();
        return {
            network,
            assetId,
            symbol,
            decimals,
            balanceRaw,
            balanceDecimal: formatTokenAmount(balanceRaw, decimals),
            source: 'toncenter_api',
            providerAlias: 'toncenter',
            fetchedAt,
            expiresAt: new Date(fetchedAt.getTime() + this.balanceTtlMs()),
        };
    }

    private evmNativeRequest(address: string, network: string): BalanceRequestSpec {
        const native = EVM_NATIVE_ASSET_BY_NETWORK[network];
        if (!native) throw new BadRequestException(`Native asset is not configured for EVM network: ${network}`);
        const assetId = `${network}/native`;
        return {
            key: assetId,
            assetId,
            symbol: native.symbol,
            decimals: native.decimals,
            method: 'eth_getBalance',
            params: [address, 'latest'],
            source: 'evm_rpc',
            parse: (value) => this.evmQuantity(value),
        };
    }

    private result(
        network: string,
        spec: BalanceRequestSpec,
        balanceRaw: string,
        providerAlias: string,
    ): LiveChainBalance {
        const fetchedAt = new Date();
        return {
            network,
            assetId: spec.assetId,
            symbol: spec.symbol,
            decimals: spec.decimals,
            balanceRaw,
            balanceDecimal: formatTokenAmount(balanceRaw, spec.decimals),
            source: spec.source,
            providerAlias,
            fetchedAt,
            expiresAt: new Date(fetchedAt.getTime() + this.balanceTtlMs()),
        };
    }

    private nearNativeAmount(value: unknown): string {
        const amount = value && typeof value === 'object' ? Reflect.get(value, 'amount') : undefined;
        if (typeof amount !== 'string' || !/^\d+$/.test(amount)) {
            throw new Error('NEAR RPC returned an invalid native balance');
        }
        return amount;
    }

    private nearFunctionAmount(value: unknown): string {
        const bytes = value && typeof value === 'object' ? Reflect.get(value, 'result') : undefined;
        if (!Array.isArray(bytes)) throw new Error('NEAR RPC returned an invalid function result');
        let decoded: unknown;
        try {
            decoded = JSON.parse(Buffer.from(bytes).toString('utf8'));
        } catch {
            throw new Error('NEAR RPC returned an invalid token balance');
        }
        if (typeof decoded !== 'string' || !/^\d+$/.test(decoded)) {
            throw new Error('NEAR RPC returned an invalid token balance');
        }
        return decoded;
    }

    private evmQuantity(value: unknown): string {
        if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) {
            throw new Error('EVM RPC returned an invalid balance');
        }
        return BigInt(value).toString(10);
    }

    private nep141Contract(asset: AssetDto): string {
        const contract = asset.assetId.startsWith('nep141:') ? asset.assetId.slice('nep141:'.length) : undefined;
        if (!contract || !/^[a-z0-9._-]+$/i.test(contract)) {
            throw new BadRequestException('Asset is not a supported NEP-141 token');
        }
        return contract;
    }

    private assertNearAccount(address: string): void {
        const named = /^[a-z0-9._-]+\.(?:near|testnet|tg)$/i.test(address);
        const implicit = /^[a-f0-9]{64}$/i.test(address);
        if (!named && !implicit) throw new BadRequestException('Wallet is not a valid NEAR account');
    }

    private assertEvmAccount(address: string): void {
        if (!/^0x[a-f0-9]{40}$/i.test(address)) throw new BadRequestException('Wallet is not a valid EVM address');
    }

    private assertTonAccount(address: string): void {
        const userFriendly = /^[A-Za-z0-9_-]{48}$/.test(address);
        const raw = /^(?:-1|0):[a-f0-9]{64}$/i.test(address);
        if (!userFriendly && !raw) throw new BadRequestException('Wallet is not a valid TON address');
    }

    private assertEvmAssetNetwork(asset: AssetDto, network: string): void {
        const expected = EVM_NETWORK_BY_BLOCKCHAIN[asset.blockchain.toLowerCase()];
        if (!expected || expected !== network) {
            throw new BadRequestException('Asset is not supported on the requested EVM network');
        }
    }

    private balanceTtlMs(): number {
        const value = Number(
            this.config.get('BALANCE_CACHE_TTL_MS') || this.config.get('NEAR_BALANCE_TTL_MS') || 15000,
        );
        return Number.isFinite(value) && value > 0 ? value : 15000;
    }
}
