import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OneClickApiHttpClient } from '../../http-clients/one-click-api/one-click-api.http-client';
import { OneClickTokenDto } from '../../http-clients/one-click-api/dto/one-click-token.dto';
import { AssetDto, GetAssetsResponseDto } from './dto/get-assets-response.dto';

type AssetsCacheEntry = {
    data: AssetDto[];
    fetchedAt: Date;
    expiresAt: Date;
};

@Injectable()
export class AssetsService {
    private cache: AssetsCacheEntry | null = null;

    constructor(
        private readonly configService: ConfigService,
        private readonly oneClickApiHttpClient: OneClickApiHttpClient,
    ) {}

    async getAssets(): Promise<GetAssetsResponseDto> {
        const now = new Date();

        if (this.cache && this.cache.expiresAt > now) {
            return this.toResponse(this.cache, true);
        }

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
                return this.toResponse(this.cache, true);
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
            typeof token.decimals === 'number' &&
            Number.isFinite(token.decimals)
        );
    }

    private toAsset(token: OneClickTokenDto): AssetDto {
        return {
            assetId: token.assetId,
            defuseAssetId: token.assetId,
            symbol: token.symbol,
            decimals: token.decimals,
            blockchain: token.blockchain,
            contractAddress: token.contractAddress,
            price: token.price,
            priceUpdatedAt: token.priceUpdatedAt,
        };
    }

    private toResponse(cache: AssetsCacheEntry, cached: boolean): GetAssetsResponseDto {
        return {
            data: cache.data,
            meta: {
                source: '1click',
                cached,
                fetchedAt: cache.fetchedAt.toISOString(),
            },
        };
    }
}
