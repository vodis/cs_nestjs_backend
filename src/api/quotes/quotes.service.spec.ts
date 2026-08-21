import { QuotesService } from './quotes.service';
import { OneClickApiHttpClient } from '../../http-clients/one-click-api/one-click-api.http-client';
import { AssetsService } from '../assets/assets.service';

describe('QuotesService', () => {
    const oneClickApiHttpClient = {
        createQuote: jest.fn(),
    } as unknown as jest.Mocked<OneClickApiHttpClient>;
    const assetsService = {
        findAssetById: jest.fn(),
    } as unknown as jest.Mocked<AssetsService>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('maps client quote payload to 1Click quote request', async () => {
        oneClickApiHttpClient.createQuote.mockResolvedValue({ quote: { amountOut: '1' } });
        const service = new QuotesService(oneClickApiHttpClient, assetsService);

        await service.createOneClickQuote({
            dry: true,
            slippageTolerance: 50,
            originAsset: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
            destinationAsset: 'nep141:wrap.near',
            amount: '1000000',
            deadline: '2026-06-05T22:16:58.776Z',
            userAddress: '0x380B8Fa1eBFe8a652Dbb55c5a7DEc2C683BbD8b9',
            authMethod: 'evm',
            swapType: 'EXACT_INPUT',
            isConfidential: false,
            isAuthenticated: true,
        });

        expect(oneClickApiHttpClient.createQuote).toHaveBeenCalledWith({
            dry: true,
            swapType: 'EXACT_INPUT',
            slippageTolerance: 50,
            originAsset: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
            depositType: 'ORIGIN_CHAIN',
            destinationAsset: 'nep141:wrap.near',
            amount: '1000000',
            recipient: '0x380B8Fa1eBFe8a652Dbb55c5a7DEc2C683BbD8b9',
            recipientType: 'DESTINATION_CHAIN',
            refundTo: '0x380B8Fa1eBFe8a652Dbb55c5a7DEc2C683BbD8b9',
            refundType: 'ORIGIN_CHAIN',
            deadline: '2026-06-05T22:16:58.776Z',
        });
    });

    it('rejects a refund address that does not match the selected auth method before calling 1Click', async () => {
        const service = new QuotesService(oneClickApiHttpClient, assetsService);

        await expect(
            service.createOneClickQuote({
                dry: true,
                slippageTolerance: 50,
                originAsset: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
                destinationAsset: 'nep141:wrap.near',
                amount: '1000000',
                deadline: '2026-06-05T22:16:58.776Z',
                userAddress: 'UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                authMethod: 'near',
                swapType: 'EXACT_INPUT',
            }),
        ).rejects.toMatchObject({
            response: expect.objectContaining({
                code: 'INVALID_REFUND_ADDRESS',
            }),
        });

        expect(oneClickApiHttpClient.createQuote).not.toHaveBeenCalled();
    });

    it('rejects unsupported wallet auth methods before calling 1Click', async () => {
        const service = new QuotesService(oneClickApiHttpClient, assetsService);

        await expect(
            service.createOneClickQuote({
                dry: true,
                slippageTolerance: 50,
                originAsset: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
                destinationAsset: 'nep141:wrap.near',
                amount: '1000000',
                deadline: '2026-06-05T22:16:58.776Z',
                userAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                authMethod: 'stellar' as 'near',
                swapType: 'EXACT_INPUT',
            }),
        ).rejects.toMatchObject({
            response: expect.objectContaining({
                code: 'UNSUPPORTED_AUTH_METHOD',
            }),
        });

        expect(oneClickApiHttpClient.createQuote).not.toHaveBeenCalled();
    });

    it('validates a foreign recipient against the destination asset network', async () => {
        assetsService.findAssetById.mockResolvedValue({
            assetId: 'nep141:sol-usdc.omft.near',
            defuseAssetId: 'nep141:sol-usdc.omft.near',
            symbol: 'USDC',
            decimals: 6,
            blockchain: 'sol',
        });
        const service = new QuotesService(oneClickApiHttpClient, assetsService);

        await expect(
            service.createOneClickQuote({
                dry: true,
                slippageTolerance: 50,
                originAsset: 'nep141:eth-usdc.omft.near',
                destinationAsset: 'nep141:sol-usdc.omft.near',
                amount: '1000000',
                deadline: '2026-10-05T22:16:58.776Z',
                userAddress: '0x380B8Fa1eBFe8a652Dbb55c5a7DEc2C683BbD8b9',
                recipient: '0x380b8fa1ebfe8a652dbb55c5a7dec2c683bbd8b8',
                recipientType: 'DESTINATION_CHAIN',
                authMethod: 'evm',
                swapType: 'EXACT_INPUT',
            }),
        ).rejects.toMatchObject({
            response: expect.objectContaining({ code: 'INVALID_RECIPIENT' }),
        });

        expect(oneClickApiHttpClient.createQuote).not.toHaveBeenCalled();
    });

    it('treats checksummed and lowercase EVM signer recipients as equivalent', async () => {
        oneClickApiHttpClient.createQuote.mockResolvedValue({ quote: { amountOut: '1' } });
        const service = new QuotesService(oneClickApiHttpClient, assetsService);

        await service.createOneClickQuote({
            dry: true,
            slippageTolerance: 50,
            originAsset: 'nep141:eth-usdc.omft.near',
            destinationAsset: 'nep141:wrap.near',
            amount: '1000000',
            deadline: '2026-10-05T22:16:58.776Z',
            userAddress: '0x380B8Fa1eBFe8a652Dbb55c5a7DEc2C683BbD8b9',
            recipient: '0x380b8fa1ebfe8a652dbb55c5a7dec2c683bbd8b9',
            recipientType: 'DESTINATION_CHAIN',
            authMethod: 'evm',
            swapType: 'EXACT_INPUT',
        });

        expect(assetsService.findAssetById).not.toHaveBeenCalled();
        expect(oneClickApiHttpClient.createQuote).toHaveBeenCalled();
    });
});
