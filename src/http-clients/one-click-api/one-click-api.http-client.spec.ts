import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { OneClickApiHttpClient } from './one-click-api.http-client';

describe('OneClickApiHttpClient', () => {
    const post = jest.fn();

    beforeEach(() => {
        post.mockReset();
    });

    it('uses X-API-Key authentication and calls the signed intent endpoints', async () => {
        const httpService = { axiosRef: { post } } as unknown as HttpService;
        const configService = {
            get: jest.fn((key: string) => (key === 'ONE_CLICK_API_KEY' ? 'api-key' : undefined)),
        } as unknown as ConfigService;
        const client = new OneClickApiHttpClient(httpService, configService);
        const intent = { standard: 'nep413', payload: { message: 'message' } };
        const signedData = { ...intent, signature: 'signature', public_key: 'public-key' };

        post.mockResolvedValueOnce({ data: { intent, correlationId: 'generate-correlation' } });
        await expect(
            client.generateIntent({
                type: 'swap_transfer',
                standard: 'nep413',
                signerId: 'alice.near',
                depositAddress: 'deposit.near',
            }),
        ).resolves.toEqual({ intent, correlationId: 'generate-correlation' });
        expect(post).toHaveBeenLastCalledWith(
            'v0/generate-intent',
            expect.objectContaining({ depositAddress: 'deposit.near' }),
            { headers: { 'X-API-Key': 'api-key' } },
        );

        post.mockResolvedValueOnce({ data: { intentHash: 'intent-hash', correlationId: 'submit-correlation' } });
        await expect(client.submitIntent({ type: 'swap_transfer', signedData })).resolves.toEqual({
            intentHash: 'intent-hash',
            correlationId: 'submit-correlation',
        });
        expect(post).toHaveBeenLastCalledWith(
            'v0/submit-intent',
            { type: 'swap_transfer', signedData },
            {
                headers: { 'X-API-Key': 'api-key' },
            },
        );
    });

    it('keeps legacy JWT bearer authentication as a fallback', async () => {
        const httpService = { axiosRef: { post } } as unknown as HttpService;
        const configService = {
            get: jest.fn((key: string) => (key === 'ONE_CLICK_API_JWT' ? 'jwt-token' : undefined)),
        } as unknown as ConfigService;
        const client = new OneClickApiHttpClient(httpService, configService);
        post.mockResolvedValue({ data: {} });

        await client.createQuote({
            dry: false,
            swapType: 'EXACT_INPUT',
            slippageTolerance: 50,
            originAsset: 'nep141:wrap.near',
            depositType: 'INTENTS',
            destinationAsset: 'nep141:usdt.tether-token.near',
            amount: '1000',
            recipient: 'alice.near',
            recipientType: 'INTENTS',
            refundTo: 'alice.near',
            refundType: 'INTENTS',
            deadline: '2026-09-21T22:25:31.847Z',
        });

        expect(post).toHaveBeenCalledWith('v0/quote', expect.any(Object), {
            headers: { Authorization: 'Bearer jwt-token' },
        });
    });
});
