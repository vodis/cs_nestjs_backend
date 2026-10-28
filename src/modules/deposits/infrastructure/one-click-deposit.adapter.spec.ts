import { Test } from '@nestjs/testing';
import { AssetsService } from '../../../api/assets/assets.service';
import {
    OneClickApiHttpClient,
    OneClickQuoteRequest,
} from '../../../http-clients/one-click-api/one-click-api.http-client';
import { OneClickDepositAdapter } from './one-click-deposit.adapter';

describe('OneClickDepositAdapter', () => {
    const wallet = { id: 'wallet', address: '0x1111111111111111111111111111111111111111', chainType: 'ethereum' };
    const asset = {
        decimals: 6,
        assetId: 'usdc-base',
        defuseAssetId: 'usdc-base',
        blockchain: 'base',
        sourceNetwork: 'eip155:8453',
    };
    const assets = { findAssetById: jest.fn() };
    const client = { createQuote: jest.fn() };
    let adapter: OneClickDepositAdapter;
    const response = (request: OneClickQuoteRequest) => ({
        quoteRequest: request,
        quote: {
            depositAddress: '0x2222222222222222222222222222222222222222',
            deadline: request.deadline,
            amountIn: request.amount,
            minAmountOut: '900000',
        },
    });

    beforeEach(async () => {
        jest.resetAllMocks();
        assets.findAssetById.mockResolvedValue(asset);
        client.createQuote.mockImplementation(async (request: OneClickQuoteRequest) => response(request));
        const module = await Test.createTestingModule({
            providers: [
                OneClickDepositAdapter,
                { provide: AssetsService, useValue: assets },
                { provide: OneClickApiHttpClient, useValue: client },
            ],
        }).compile();
        adapter = module.get(OneClickDepositAdapter);
    });

    it('uses an executable exact-input quote bound to the selected wallet and server asset', async () => {
        const result = await adapter.create(wallet, asset.assetId, '1');
        expect(client.createQuote).toHaveBeenCalledWith(
            expect.objectContaining({
                dry: false,
                swapType: 'EXACT_INPUT',
                amount: '1000000',
                originAsset: asset.defuseAssetId,
                destinationAsset: asset.defuseAssetId,
                recipient: wallet.address,
                refundTo: wallet.address,
                recipientType: 'DESTINATION_CHAIN',
                refundType: 'ORIGIN_CHAIN',
            }),
        );
        expect(result).toEqual(
            expect.objectContaining({
                assetId: asset.assetId,
                walletId: wallet.id,
                recipient: wallet.address,
                network: asset.sourceNetwork,
                address: '0x2222222222222222222222222222222222222222',
            }),
        );
    });

    it('converts fractional amounts using registry precision', async () => {
        await adapter.create(wallet, asset.assetId, '0.000001');
        expect(client.createQuote).toHaveBeenCalledWith(expect.objectContaining({ amount: '1' }));
    });

    it.each(['0', '0.0000001', '-1', '1e6', 'NaN'])('rejects invalid amount %s before allocating', async (amount) => {
        await expect(adapter.create(wallet, asset.assetId, amount)).rejects.toThrow();
        expect(client.createQuote).not.toHaveBeenCalled();
    });

    it('allows a two-hour mining window for Bitcoin', async () => {
        assets.findAssetById.mockResolvedValue({
            ...asset,
            blockchain: 'btc',
            sourceNetwork: 'bip122:000000000019d6689c085ae165831e93',
            decimals: 8,
        });
        client.createQuote.mockImplementation(async (request: OneClickQuoteRequest) => ({
            ...response(request),
            quote: { ...response(request).quote, depositAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' },
        }));
        const now = Date.now();
        const result = await adapter.create(
            { ...wallet, chainType: 'bitcoin', address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' },
            asset.assetId,
            '1',
        );
        expect(Date.parse(result.expiresAt) - now).toBeGreaterThanOrEqual(120 * 60_000);
    });

    it('rejects incompatible wallets and unsupported assets before allocating an address', async () => {
        await expect(adapter.create({ ...wallet, chainType: 'near' }, asset.assetId, '1')).rejects.toThrow(
            'cannot receive',
        );
        assets.findAssetById.mockResolvedValue(undefined);
        await expect(adapter.create(wallet, asset.assetId, '1')).rejects.toThrow('unavailable');
        expect(client.createQuote).not.toHaveBeenCalled();
    });

    it.each(['address', 'expiry', 'recipient', 'dry', 'network', 'amount'])(
        'rejects invalid provider %s',
        async (failure) => {
            client.createQuote.mockImplementation(async (request: OneClickQuoteRequest) => {
                const result = response(request);
                if (failure === 'amount') result.quote.amountIn = '2';
                if (failure === 'address') result.quote.depositAddress = 'not-an-evm-address';
                if (failure === 'expiry') result.quote.deadline = '2000-01-01T00:00:00Z';
                if (failure === 'recipient') result.quoteRequest = { ...request, recipient: 'another-address' };
                if (failure === 'dry') result.quoteRequest = { ...request, dry: true };
                if (failure === 'network') result.quoteRequest = { ...request, destinationAsset: 'another-chain' };
                return result;
            });
            await expect(adapter.create(wallet, asset.assetId, '1')).rejects.toThrow('unavailable');
        },
    );

    it('does not synthesize a fallback when the route is rejected', async () => {
        client.createQuote.mockRejectedValue(new Error('provider rejected'));
        await expect(adapter.create(wallet, asset.assetId, '1')).rejects.toThrow('provider rejected');
        expect(client.createQuote).toHaveBeenCalledTimes(1);
    });
});
