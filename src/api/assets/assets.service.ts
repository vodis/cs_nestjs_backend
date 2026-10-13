import { SOURCE_NETWORKS, NATIVE_ROUTES } from './native-asset-routes';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OneClickApiHttpClient } from '../../http-clients/one-click-api/one-click-api.http-client';
import { OneClickTokenDto } from '../../http-clients/one-click-api/dto/one-click-token.dto';
import { isValidTokenDecimals } from '../../utils/decimal.util';
import { AssetDto, GetAssetsResponseDto } from './dto/get-assets-response.dto';
import { getSeedAssetMetadata } from './assets-metadata.seed';

type AssetsCacheEntry = {
    data: AssetDto[];
    fetchedAt: Date;
    expiresAt: Date;
};

@Injectable()
export class AssetsService {
    private cache: AssetsCacheEntry | null = null;
    private refresh?: Promise<GetAssetsResponseDto>;

    constructor(
        private readonly configService: ConfigService,
        private readonly oneClickApiHttpClient: OneClickApiHttpClient,
    ) {}

    async findAssetById(assetId: string): Promise<AssetDto | undefined> {
        const { data, meta } = await this.getAssets();
        if (meta.stale) throw new ServiceUnavailableException('Asset registry is stale; try again shortly');
        return data.find((asset) => asset.assetId === assetId || asset.defuseAssetId === assetId);
    }

    async getAssets(): Promise<GetAssetsResponseDto> {
        const now = new Date();

        if (this.cache && this.cache.expiresAt > now) {
            return this.toResponse(this.cache, true);
        }

        if (!this.refresh) {
            this.refresh = this.refreshAssets().finally(() => {
                this.refresh = undefined;
            });
        }
        return this.refresh;
    }

    private async refreshAssets(): Promise<GetAssetsResponseDto> {
        try {
            const tokens = await this.oneClickApiHttpClient.getTokens();
            const data = tokens.filter((token) => this.isValidToken(token)).map((token) => this.toAsset(token));
            const fetchedAt = new Date();

            this.cache = {
                data,
                fetchedAt,
                expiresAt: new Date(fetchedAt.getTime() + this.getCacheTtlMs()),
            };

            return this.toResponse(this.cache, false);
        } catch (error) {
            if (this.cache) {
                return this.toResponse(this.cache, true, true);
            }

            throw new ServiceUnavailableException('Assets list is temporarily unavailable');
        }
    }

    private getCacheTtlMs(): number {
        const value = Number(this.configService.get('ASSETS_CACHE_TTL_MS') || 300000);
        return Number.isFinite(value) && value > 0 ? value : 300000;
    }

    private isValidToken(token: OneClickTokenDto): boolean {
        return (
            typeof token?.assetId === 'string' &&
            token.assetId.length > 0 &&
            typeof token.symbol === 'string' &&
            token.symbol.length > 0 &&
            typeof token.blockchain === 'string' &&
            token.blockchain.length > 0 &&
            isValidTokenDecimals(token.decimals)
        );
    }

    private toAsset(token: OneClickTokenDto): AssetDto {
        const metadata = getSeedAssetMetadata(token.assetId, token.symbol);

        return {
            assetId: token.assetId,
            defuseAssetId: token.assetId,
            ...(token.assetId === NATIVE_ROUTES[token.blockchain] || token.assetId === '1cs_v1:btc:native:coin'
                ? {
                      balanceAssetId:
                          token.blockchain === 'ton' ? 'ton:native' : `${SOURCE_NETWORKS[token.blockchain]}/native`,
                  }
                : {}),
            sourceNetwork: SOURCE_NETWORKS[token.blockchain],
            symbol: token.symbol,
            name: metadata?.name,
            icon: metadata?.icon || undefined,
            decimals: token.decimals,
            blockchain: token.blockchain,
            contractAddress: token.contractAddress,
            price: token.price,
            priceUpdatedAt: token.priceUpdatedAt,
        };
    }

    private toResponse(cache: AssetsCacheEntry, cached: boolean, stale = false): GetAssetsResponseDto {
        return {
            data: cache.data,
            meta: {
                source: '1click',
                stale,
                cached,
                fetchedAt: cache.fetchedAt.toISOString(),
            },
        };
    }
}
