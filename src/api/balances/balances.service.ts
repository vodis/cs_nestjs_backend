import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Op } from 'sequelize';
import { AssetDto } from '../assets/dto/get-assets-response.dto';
import { AssetsService } from '../assets/assets.service';
import { BalanceCacheEntry } from '../../database/models/balance-cache-entry.model';
import { WalletLink } from '../../database/models/wallet-link.model';
import type { AuthenticatedUser } from '../auth/types';
import { GetBalancesQueryDto } from './dto/get-balances-query.dto';
import { BalanceDto, GetBalancesResponseDto } from './dto/get-balances-response.dto';
import { NearNativeBalance, NearRpcBalanceService } from './near-rpc-balance.service';
import { PostBalancesRequestDto } from './dto/post-balances-request.dto';

const NEAR_NATIVE_ASSET_IDS = new Set(['near:native', 'nep141:wrap.near']);
type BalancesRequest = GetBalancesQueryDto | PostBalancesRequestDto;

@Injectable()
export class BalancesService {
    constructor(
        private readonly assetsService: AssetsService,
        private readonly nearRpcBalanceService: NearRpcBalanceService,
    ) {}

    async getBalances(user: AuthenticatedUser, query: BalancesRequest): Promise<GetBalancesResponseDto> {
        const now = new Date();
        const wallets = await this.findWallets(user.id, query);
        const asset = query.assetId ? await this.findSupportedAsset(query.assetId) : undefined;

        if (wallets.length === 0) {
            return this.toResponse([], now);
        }

        const entries = await BalanceCacheEntry.findAll({
            where: {
                userId: user.id,
                walletId: { [Op.in]: wallets.map((wallet) => wallet.id) },
                ...(asset ? { assetId: asset.assetId } : {}),
                expiresAt: { [Op.gt]: now },
            },
            order: [
                ['walletId', 'ASC'],
                ['assetId', 'ASC'],
            ],
        });

        const cachedBalances = entries.map((entry) => this.toDto(entry));
        const cachedKeys = new Set(cachedBalances.map((balance) => `${balance.walletId}|${balance.assetId}`));
        const refreshedNearBalances = await this.getMissingNearBalances(user.id, wallets, asset, cachedKeys);

        return this.toResponse([...refreshedNearBalances, ...cachedBalances], now, refreshedNearBalances.length > 0);
    }

    private async findWallets(userId: string, query: BalancesRequest): Promise<WalletLink[]> {
        const walletAddress = 'walletAddress' in query ? query.walletAddress : undefined;
        const network = 'network' in query ? query.network : undefined;

        if (query.walletId || walletAddress) {
            const wallet = await WalletLink.findOne({
                where: {
                    ...(query.walletId ? { id: query.walletId } : {}),
                    ...(walletAddress ? { address: walletAddress } : {}),
                    ...(network ? { chainType: this.normalizeNetwork(network) } : {}),
                    userId,
                    status: 'active',
                },
            });
            if (!wallet) {
                throw new NotFoundException('Wallet not found');
            }
            return [wallet];
        }

        return WalletLink.findAll({
            where: {
                userId,
                status: 'active',
                ...(network ? { chainType: this.normalizeNetwork(network) } : {}),
            },
            order: [
                ['isPrimary', 'DESC'],
                ['createdAt', 'ASC'],
            ],
        });
    }

    private async findSupportedAsset(assetId: string): Promise<AssetDto> {
        const asset = await this.assetsService.findAssetById(assetId);
        if (!asset) {
            throw new BadRequestException('Unsupported asset');
        }
        return asset;
    }

    private toDto(entry: BalanceCacheEntry): BalanceDto {
        return {
            walletId: entry.walletId,
            walletAddress: entry.walletAddress,
            chainType: entry.chainType,
            assetId: entry.assetId,
            symbol: entry.symbol,
            decimals: entry.decimals,
            balanceRaw: entry.balanceRaw,
            balanceDecimal: entry.balanceDecimal ?? null,
            source: entry.source,
            fetchedAt: entry.fetchedAt.toISOString(),
            expiresAt: entry.expiresAt.toISOString(),
        };
    }

    private async getMissingNearBalances(
        userId: string,
        wallets: WalletLink[],
        asset: AssetDto | undefined,
        cachedKeys: Set<string>,
    ): Promise<BalanceDto[]> {
        if (asset && !this.isNearNativeAsset(asset)) {
            return [];
        }

        const nearWallets = wallets.filter(
            (wallet) => wallet.chainType === 'near' && this.isNearAccount(wallet.address),
        );
        const missingNearWallets = nearWallets.filter((wallet) => !cachedKeys.has(`${wallet.id}|near:native`));
        const balances = await Promise.all(
            missingNearWallets.map(async (wallet) => this.refreshNearBalance(userId, wallet)),
        );

        return balances;
    }

    private async refreshNearBalance(userId: string, wallet: WalletLink): Promise<BalanceDto> {
        const balance = await this.nearRpcBalanceService.getNativeBalance(wallet.address);
        const dto = this.toNearDto(wallet, balance);

        await BalanceCacheEntry.upsert({
            userId,
            walletId: wallet.id,
            walletAddress: wallet.address,
            chainType: 'near',
            assetId: dto.assetId,
            symbol: dto.symbol,
            decimals: dto.decimals,
            balanceRaw: dto.balanceRaw,
            balanceDecimal: dto.balanceDecimal,
            source: dto.source,
            fetchedAt: balance.fetchedAt,
            expiresAt: balance.expiresAt,
        });

        return dto;
    }

    private isNearNativeAsset(asset: AssetDto): boolean {
        return asset.symbol === 'NEAR' || asset.symbol === 'wNEAR' || NEAR_NATIVE_ASSET_IDS.has(asset.assetId);
    }

    private isNearAccount(address: string): boolean {
        return /^[a-z0-9._-]+\.(?:near|testnet|tg)$/i.test(address);
    }

    private normalizeNetwork(network: NonNullable<PostBalancesRequestDto['network']>): string {
        if (network === 'near:mainnet' || network === 'near:testnet') {
            return 'near';
        }

        if (network.startsWith('eip155:')) {
            return 'ethereum';
        }

        return network;
    }

    private toNearDto(wallet: WalletLink, balance: NearNativeBalance): BalanceDto {
        return {
            walletId: wallet.id,
            walletAddress: wallet.address,
            chainType: 'near',
            assetId: balance.assetId,
            symbol: balance.symbol,
            decimals: balance.decimals,
            balanceRaw: balance.balanceRaw,
            balanceDecimal: balance.balanceDecimal,
            source: 'near_rpc',
            fetchedAt: balance.fetchedAt.toISOString(),
            expiresAt: balance.expiresAt.toISOString(),
        };
    }

    private toResponse(data: BalanceDto[], now: Date, hasLiveBalances = false): GetBalancesResponseDto {
        return {
            data,
            meta: {
                source: hasLiveBalances && data.length > 0 ? 'mixed' : 'postgres_cache',
                cached: !hasLiveBalances,
                fetchedAt: now.toISOString(),
            },
        };
    }
}
