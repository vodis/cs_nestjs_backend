import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Op } from 'sequelize';
import { AssetDto } from '../assets/dto/get-assets-response.dto';
import { AssetsService } from '../assets/assets.service';
import { BalanceCacheEntry } from '../../database/models/balance-cache-entry.model';
import { WalletLink } from '../../database/models/wallet-link.model';
import type { AuthenticatedUser } from '../auth/types';
import { GetBalancesQueryDto } from './dto/get-balances-query.dto';
import { BalanceDto, GetBalancesResponseDto } from './dto/get-balances-response.dto';

@Injectable()
export class BalancesService {
    constructor(private readonly assetsService: AssetsService) {}

    async getBalances(user: AuthenticatedUser, query: GetBalancesQueryDto): Promise<GetBalancesResponseDto> {
        const now = new Date();
        const wallets = await this.findWallets(user.id, query.walletId);
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

        return this.toResponse(
            entries.map((entry) => this.toDto(entry)),
            now,
        );
    }

    private async findWallets(userId: string, walletId?: string): Promise<WalletLink[]> {
        if (walletId) {
            const wallet = await WalletLink.findOne({ where: { id: walletId, userId, status: 'active' } });
            if (!wallet) {
                throw new NotFoundException('Wallet not found');
            }
            return [wallet];
        }

        return WalletLink.findAll({
            where: { userId, status: 'active' },
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

    private toResponse(data: BalanceDto[], now: Date): GetBalancesResponseDto {
        return {
            data,
            meta: {
                source: 'postgres_cache',
                cached: true,
                fetchedAt: now.toISOString(),
            },
        };
    }
}
