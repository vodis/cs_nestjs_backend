import { validate } from 'class-validator';
import { PreviewSwapDto } from './dto/preview-swap.dto';
import { Test } from '@nestjs/testing';
import { QuotesService } from './quotes.service';
import { AssetsService } from '../assets/assets.service';
import { OneClickApiHttpClient } from '../../http-clients/one-click-api/one-click-api.http-client';

describe('indicative guest preview', () => {
    it('allows policy-approved tolerances above the default and rejects invalid basis points', async () => {
        const dto = Object.assign(new PreviewSwapDto(), {
            originAsset: 'a',
            destinationAsset: 'b',
            amount: '100',
            swapType: 'EXACT_INPUT',
            slippageTolerance: 1500,
        });
        expect(await validate(dto)).toEqual([]);
        dto.slippageTolerance = 10001;
        expect(await validate(dto)).toHaveLength(1);
    });
    it('forces dry pricing and returns only amounts with a short display lifetime', async () => {
        const client = {
            createQuote: jest.fn().mockResolvedValue({
                quote: { amountIn: '100', amountOut: '200', depositAddress: 'never-expose' },
                signature: 'never-expose',
            }),
        };
        const assets = {
            findAssetById: jest.fn(async (id: string) => ({ assetId: id, defuseAssetId: id, blockchain: 'near' })),
        };
        const module = await Test.createTestingModule({
            providers: [
                QuotesService,
                { provide: AssetsService, useValue: assets },
                { provide: OneClickApiHttpClient, useValue: client },
            ],
        }).compile();
        const result = await module.get(QuotesService).preview({
            originAsset: 'a',
            destinationAsset: 'b',
            amount: '100',
            swapType: 'EXACT_INPUT',
            slippageTolerance: 50,
        });
        expect(client.createQuote).toHaveBeenCalledWith(
            expect.objectContaining({ dry: true, recipientType: 'INTENTS', depositType: 'ORIGIN_CHAIN' }),
        );
        expect(result).toMatchObject({ amountIn: '100', amountOut: '200', indicative: true });
        expect(Date.parse(result.expiresAt) - Date.now()).toBeLessThanOrEqual(30000);
        expect(JSON.stringify(result)).not.toContain('never-expose');
        await expect(
            module.get(QuotesService).preview({
                originAsset: 'a',
                destinationAsset: 'a',
                amount: '100',
                swapType: 'EXACT_INPUT',
                slippageTolerance: 50,
            }),
        ).rejects.toThrow('different assets');
    });
});
