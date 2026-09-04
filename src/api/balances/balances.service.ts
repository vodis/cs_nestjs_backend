import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Op } from 'sequelize';
import { AssetDto } from '../assets/dto/get-assets-response.dto';
import { AssetsService } from '../assets/assets.service';
import { BalanceCacheEntry } from '../../database/models/balance-cache-entry.model';
import { WalletLink } from '../../database/models/wallet-link.model';
import type { AuthenticatedUser } from '../auth/types';
import { BalanceAccount, ChainBalanceService, LiveChainBalance } from './chain-balance.service';
import { GetBalancesQueryDto } from './dto/get-balances-query.dto';
import { BalanceDto, GetBalancesResponseDto } from './dto/get-balances-response.dto';
import { PostBalancesRequestDto } from './dto/post-balances-request.dto';
import { NEAR_NATIVE_ASSET_ID } from './near-balance.constants';

type BalancesRequest = GetBalancesQueryDto | PostBalancesRequestDto;
type BalanceSubject = BalanceAccount & { walletId: string | null };
type SelectedWallet = { wallet: BalanceSubject; network?: string };
type RefreshTarget = { wallet: BalanceSubject; network: string; asset?: AssetDto; assetId: string };
type RefreshGroup = { wallet: BalanceSubject; network: string; targets: RefreshTarget[] };

// Sequelize emits explicit conflictFields verbatim, so underscored database
// columns are required even though its TypeScript declaration expects attributes.
const LEGACY_CACHE_CONFLICT_FIELDS = ['user_id', 'wallet_id', 'asset_id'] as unknown as Array<keyof BalanceCacheEntry>;

@Injectable()
export class BalancesService {
    private readonly logger = new Logger(BalancesService.name);

    constructor(
        private readonly assetsService: AssetsService,
        private readonly chainBalances: ChainBalanceService,
    ) {}

    async getBalances(user: AuthenticatedUser, query: BalancesRequest): Promise<GetBalancesResponseDto> {
        const now = new Date();
        const selected = await this.findWallets(user.id, query);
        const assets = await this.findSupportedAssets(query);
        if (selected.length === 0) return this.toResponse([], now, 0, 0);

        const requestedNetwork = this.requestedNetwork(query);
        const linkedWalletIds = selected.flatMap(({ wallet }) => (wallet.walletId ? [wallet.walletId] : []));
        const entries = linkedWalletIds.length
            ? await BalanceCacheEntry.findAll({
                  where: {
                      userId: user.id,
                      walletId: { [Op.in]: linkedWalletIds },
                      ...(assets.length ? { assetId: { [Op.in]: assets.map((asset) => asset.assetId) } } : {}),
                      ...(requestedNetwork ? { network: requestedNetwork } : {}),
                  },
                  order: [
                      ['walletId', 'ASC'],
                      ['network', 'ASC'],
                      ['assetId', 'ASC'],
                  ],
              })
            : [];
        const freshEntries = entries.filter((entry) => entry.expiresAt > now);
        const freshKeys = new Set(
            freshEntries.map((entry) => this.key(entry.walletId, this.cacheNetwork(entry), entry.assetId)),
        );
        const targets = selected.flatMap(({ wallet, network }) => {
            if (!network) return [];
            const requestedAssets = assets.length ? assets : [undefined];
            return requestedAssets.flatMap((asset) => {
                const assetId = asset?.assetId || this.nativeAssetId(network);
                return wallet.walletId && freshKeys.has(this.key(wallet.walletId, network, assetId))
                    ? []
                    : [{ wallet, network, asset, assetId }];
            });
        });

        const groups = this.groupTargets(targets);
        const results = await Promise.allSettled(groups.map(async (group) => this.refreshBalances(user.id, group)));
        const liveBalances: BalanceDto[] = [];
        const failedTargets: RefreshTarget[] = [];
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                liveBalances.push(...result.value.balances);
                failedTargets.push(
                    ...groups[index].targets.filter((target) => result.value.failedAssetIds.includes(target.assetId)),
                );
                return;
            }
            if (result.reason instanceof BadRequestException) throw result.reason;
            const group = groups[index];
            failedTargets.push(...group.targets);
            this.logger.warn(
                `Balance refresh failed wallet=${group.wallet.walletId || group.wallet.address} network=${group.network} reason=${
                    result.reason?.message || 'provider unavailable'
                }`,
            );
        });

        const liveKeys = new Set(
            liveBalances.map((balance) => this.key(balance.walletId, balance.network, balance.assetId)),
        );
        const cachedBalances = freshEntries
            .filter((entry) => !liveKeys.has(this.key(entry.walletId, this.cacheNetwork(entry), entry.assetId)))
            .map((entry) => this.toDto(entry, false));
        const staleFallbacks = failedTargets.flatMap((target) => {
            const entry = entries.find(
                (candidate) =>
                    candidate.walletId === target.wallet.walletId &&
                    this.cacheNetwork(candidate) === target.network &&
                    candidate.assetId === target.assetId &&
                    candidate.expiresAt <= now,
            );
            return entry ? [this.toDto(entry, true)] : [];
        });

        return this.toResponse(
            [...liveBalances, ...cachedBalances, ...staleFallbacks],
            now,
            liveBalances.length,
            failedTargets.length,
        );
    }

    private async findWallets(userId: string, query: BalancesRequest): Promise<SelectedWallet[]> {
        const walletAddress = 'walletAddress' in query ? query.walletAddress : undefined;
        const network = this.requestedNetwork(query);
        const chainType = network ? this.chainTypeFilter(network) : undefined;

        if (query.walletId) {
            const wallet = await WalletLink.findOne({
                where: {
                    id: query.walletId,
                    ...(walletAddress ? { address: walletAddress } : {}),
                    ...(chainType ? { chainType } : {}),
                    userId,
                    status: 'active',
                },
            });
            if (!wallet) throw new NotFoundException('Wallet not found');
            return [{ wallet: this.linkedSubject(wallet), network: network || this.inferNetwork(wallet) }];
        }

        if (walletAddress) {
            const normalizedAddress = this.normalizeAddress(walletAddress, network);
            const wallet = await WalletLink.findOne({
                where: {
                    address: normalizedAddress,
                    ...(chainType ? { chainType } : {}),
                    userId,
                    status: 'active',
                },
            });
            if (wallet) return [{ wallet: this.linkedSubject(wallet), network: network || this.inferNetwork(wallet) }];
            if (!network) throw new BadRequestException('network is required for an unlinked wallet address');
            this.chainBalances.assertAddress(network, normalizedAddress);
            return [
                { wallet: { walletId: null, address: normalizedAddress, chainType: this.chainType(network) }, network },
            ];
        }

        const wallets = await WalletLink.findAll({
            where: {
                userId,
                status: 'active',
                ...(chainType ? { chainType } : {}),
            },
            order: [
                ['isPrimary', 'DESC'],
                ['createdAt', 'ASC'],
            ],
        });
        return wallets.map((wallet) => ({
            wallet: this.linkedSubject(wallet),
            network: network || this.inferNetwork(wallet),
        }));
    }

    private async findSupportedAssets(query: BalancesRequest): Promise<AssetDto[]> {
        const assetIds = this.requestedAssetIds(query);
        if (!assetIds.length) return [];

        const { data } = await this.assetsService.getAssets();
        const byId = new Map<string, AssetDto>();
        for (const asset of data) {
            byId.set(asset.assetId, asset);
            byId.set(asset.defuseAssetId, asset);
        }
        const assets = assetIds.map((assetId) => byId.get(assetId));
        if (assets.some((asset) => !asset)) throw new BadRequestException('Unsupported asset');
        return assets as AssetDto[];
    }

    private requestedAssetIds(query: BalancesRequest): string[] {
        const batch = 'assetIds' in query ? query.assetIds || [] : [];
        if (query.assetId && batch.length) throw new BadRequestException('Use assetId or assetIds, not both');
        return [...new Set(query.assetId ? [query.assetId] : batch)];
    }

    private groupTargets(targets: RefreshTarget[]): RefreshGroup[] {
        const groups = new Map<string, RefreshGroup>();
        for (const target of targets) {
            const key = `${target.wallet.walletId || `external:${target.wallet.address}`}|${target.network}`;
            const group = groups.get(key) || { wallet: target.wallet, network: target.network, targets: [] };
            group.targets.push(target);
            groups.set(key, group);
        }
        return [...groups.values()];
    }

    private async refreshBalances(
        userId: string,
        group: RefreshGroup,
    ): Promise<{ balances: BalanceDto[]; failedAssetIds: string[] }> {
        const result = await this.chainBalances.getBalances(
            group.wallet,
            group.network,
            group.targets.map((target) => target.asset),
        );
        if (group.wallet.walletId) {
            await Promise.all(
                result.balances.map((balance) =>
                    BalanceCacheEntry.upsert(
                        {
                            userId,
                            walletId: group.wallet.walletId as string,
                            walletAddress: group.wallet.address,
                            chainType: group.wallet.chainType,
                            network: group.network,
                            assetId: balance.assetId,
                            symbol: balance.symbol,
                            decimals: balance.decimals,
                            balanceRaw: balance.balanceRaw,
                            balanceDecimal: balance.balanceDecimal,
                            source: balance.source,
                            fetchedAt: balance.fetchedAt,
                            expiresAt: balance.expiresAt,
                        },
                        { conflictFields: LEGACY_CACHE_CONFLICT_FIELDS },
                    ),
                ),
            );
        }
        return {
            balances: result.balances.map((balance) => this.toLiveDto(group.wallet, balance)),
            failedAssetIds: result.failures.map((failure) => failure.assetId),
        };
    }

    private toDto(entry: BalanceCacheEntry, stale: boolean): BalanceDto {
        return {
            walletId: entry.walletId,
            walletAddress: entry.walletAddress,
            chainType: entry.chainType,
            network: this.cacheNetwork(entry),
            assetId: entry.assetId,
            symbol: entry.symbol,
            decimals: entry.decimals,
            balanceRaw: entry.balanceRaw,
            balanceDecimal: entry.balanceDecimal ?? null,
            source: entry.source,
            fetchedAt: entry.fetchedAt.toISOString(),
            expiresAt: entry.expiresAt.toISOString(),
            stale,
        };
    }

    private toLiveDto(wallet: BalanceSubject, balance: LiveChainBalance): BalanceDto {
        return {
            walletId: wallet.walletId,
            walletAddress: wallet.address,
            chainType: wallet.chainType,
            network: balance.network,
            assetId: balance.assetId,
            symbol: balance.symbol,
            decimals: balance.decimals,
            balanceRaw: balance.balanceRaw,
            balanceDecimal: balance.balanceDecimal,
            source: balance.source,
            fetchedAt: balance.fetchedAt.toISOString(),
            expiresAt: balance.expiresAt.toISOString(),
            stale: false,
        };
    }

    private requestedNetwork(query: BalancesRequest): string | undefined {
        return 'network' in query ? query.network : undefined;
    }

    private inferNetwork(wallet: WalletLink): string | undefined {
        if (wallet.chainType === 'near') {
            return /\.(?:testnet|tg)$/i.test(wallet.address) ? 'near:testnet' : 'near:mainnet';
        }
        if (wallet.chainType === 'ton') return 'ton:mainnet';
        return undefined;
    }

    private chainTypeFilter(network: string): string | object {
        if (network.startsWith('near:')) return 'near';
        if (network.startsWith('eip155:')) return { [Op.in]: ['ethereum', 'evm'] };
        if (network === 'ton:mainnet' || network === 'ton:testnet') return 'ton';
        throw new BadRequestException('Unsupported balance network');
    }

    private nativeAssetId(network: string): string {
        if (network.startsWith('near:')) return NEAR_NATIVE_ASSET_ID;
        if (network === 'ton:mainnet' || network === 'ton:testnet') return 'ton:native';
        return `${network}/native`;
    }

    private cacheNetwork(entry: Pick<BalanceCacheEntry, 'network' | 'chainType'>): string {
        if (entry.network) return entry.network;
        if (entry.chainType === 'near') return 'near:mainnet';
        if (entry.chainType === 'ethereum' || entry.chainType === 'evm') return 'eip155:1';
        return entry.chainType;
    }

    private key(walletId: string | null, network: string, assetId: string): string {
        return `${walletId || 'unlinked'}|${network}|${assetId}`;
    }

    private linkedSubject(wallet: WalletLink): BalanceSubject {
        return { walletId: wallet.id, address: wallet.address, chainType: wallet.chainType };
    }

    private normalizeAddress(address: string, network?: string): string {
        const value = address.trim();
        return network?.startsWith('eip155:') || /^0x/i.test(value) ? value.toLowerCase() : value;
    }

    private chainType(network: string): string {
        if (network.startsWith('near:')) return 'near';
        if (network.startsWith('eip155:')) return 'ethereum';
        if (network === 'ton:mainnet' || network === 'ton:testnet') return 'ton';
        throw new BadRequestException('Unsupported balance network');
    }

    private toResponse(data: BalanceDto[], now: Date, liveCount: number, failureCount: number): GetBalancesResponseDto {
        return {
            data,
            meta: {
                source: liveCount > 0 ? (data.length > liveCount ? 'mixed' : 'rpc') : 'postgres_cache',
                cached: liveCount === 0,
                fetchedAt: now.toISOString(),
                partial: failureCount > 0,
            },
        };
    }
}
