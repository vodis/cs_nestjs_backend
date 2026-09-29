import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OneClickApiHttpClient, OneClickQuoteRequest } from './one-click-api.http-client';

describe('OneClickApiHttpClient', () => {
    const post = jest.fn();
    const get = jest.fn();

    beforeEach(() => {
        post.mockReset();
        get.mockReset();
    });

    it('queries swap status with the stored deposit address and memo', async () => {
        const httpService = { axiosRef: { get } } as unknown as HttpService;
        const configService = {
            get: jest.fn((key: string) => (key === 'ONE_CLICK_API_KEY' ? 'api-key' : undefined)),
        } as unknown as ConfigService;
        const client = new OneClickApiHttpClient(httpService, configService);
        get.mockResolvedValue({ data: { status: 'PROCESSING' } });

        await expect(client.getSwapStatus('deposit.near', 'memo-1')).resolves.toEqual({ status: 'PROCESSING' });
        expect(get).toHaveBeenCalledWith('v0/status', {
            headers: { 'X-API-Key': 'api-key' },
            params: { depositAddress: 'deposit.near', depositMemo: 'memo-1' },
        });
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

    it('turns a rejected signed intent into a safe, definitive error', async () => {
        const httpService = { axiosRef: { post } } as unknown as HttpService;
        const configService = { get: jest.fn(() => 'staging-secret') } as unknown as ConfigService;
        const client = new OneClickApiHttpClient(httpService, configService);
        post.mockRejectedValue({
            isAxiosError: true,
            response: { status: 400, data: { message: 'signedData must match MultiPayload schema' } },
            config: { headers: { Authorization: 'Bearer staging-secret' }, data: 'signed-payload' },
        });

        const error = await client.submitIntent({ type: 'swap_transfer', signedData: {} }).catch((caught) => caught);
        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toMatchObject({ code: 'ONE_CLICK_SUBMISSION_REJECTED' });
        expect(JSON.stringify(error)).not.toMatch(/staging-secret|signed-payload/);
    });

    it('preserves the existing v1 quote validation response without exposing the request', async () => {
        const httpService = { axiosRef: { post } } as unknown as HttpService;
        const configService = { get: jest.fn(() => 'staging-secret') } as unknown as ConfigService;
        const client = new OneClickApiHttpClient(httpService, configService);
        const providerError = { message: 'Unsupported asset pair', error: 'Bad Request', statusCode: 400 };
        post.mockRejectedValue({
            isAxiosError: true,
            response: { status: 400, data: providerError },
            config: { headers: { Authorization: 'Bearer staging-secret' } },
        });

        const request: OneClickQuoteRequest = {
            dry: true,
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
        };
        const error = await client.createQuote(request).catch((caught) => caught);
        if (!(error instanceof HttpException)) throw error;
        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toEqual(providerError);
        expect(JSON.stringify(error)).not.toContain('staging-secret');
    });

    it('does not expose a 1Click request or credential after an uncertain upstream failure', async () => {
        const httpService = { axiosRef: { post } } as unknown as HttpService;
        const configService = { get: jest.fn(() => 'staging-secret') } as unknown as ConfigService;
        const client = new OneClickApiHttpClient(httpService, configService);
        post.mockRejectedValue({
            isAxiosError: true,
            response: { status: 502 },
            config: { headers: { Authorization: 'Bearer staging-secret' }, data: 'signed-payload' },
        });

        const error = await client.submitIntent({ type: 'swap_transfer', signedData: {} }).catch((caught) => caught);
        expect(error.getStatus()).toBe(502);
        expect(error.getResponse()).toMatchObject({ code: 'ONE_CLICK_UPSTREAM_ERROR' });
        expect(JSON.stringify(error)).not.toMatch(/staging-secret|signed-payload/);
    });
});
