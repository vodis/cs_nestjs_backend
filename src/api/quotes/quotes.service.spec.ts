import { QuotesService } from './quotes.service';
import { OneClickApiHttpClient } from '../../http-clients/one-click-api/one-click-api.http-client';

describe('QuotesService', () => {
    const oneClickApiHttpClient = {
        createQuote: jest.fn(),
    } as unknown as jest.Mocked<OneClickApiHttpClient>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('maps client quote payload to 1Click quote request', async () => {
        oneClickApiHttpClient.createQuote.mockResolvedValue({ quote: { amountOut: '1' } });
        const service = new QuotesService(oneClickApiHttpClient);

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
});
