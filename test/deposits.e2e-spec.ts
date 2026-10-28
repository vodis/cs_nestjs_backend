import { INestApplication, Module, UnauthorizedException, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AuthModule } from '../src/api/auth/auth.module';
import { PrivyAuthService } from '../src/api/auth/privy-auth.service';
import {
    OneClickApiHttpClient,
    OneClickQuoteRequest,
} from '../src/http-clients/one-click-api/one-click-api.http-client';
import { DepositsModule } from '../src/modules/deposits/deposits.module';

const wallet = {
    id: '11111111-1111-4111-8111-111111111111',
    address: '0x1111111111111111111111111111111111111111',
    chainType: 'ethereum',
    isPrimary: true,
    status: 'active',
    deletedAt: null,
};
const token = { assetId: 'usdc-base', symbol: 'USDC', blockchain: 'base', decimals: 6 };
const depositAddress = '0x2222222222222222222222222222222222222222';
const auth = {
    authenticateToken: jest.fn(),
    walletsForUser: jest.fn(),
};

// Replace external identity/storage only; the real bearer guard and wallet adapter remain wired.
@Module({ providers: [{ provide: PrivyAuthService, useValue: auth }], exports: [PrivyAuthService] })
class TestAuthModule {}

describe('Deposit instructions HTTP integration', () => {
    let app: INestApplication;
    const provider = { getTokens: jest.fn(), createQuote: jest.fn() };
    const payload = { walletId: wallet.id, assetId: token.assetId, amount: '1.25' };
    const endpoint = '/api/v1/deposits/instructions';
    const quote = (input: OneClickQuoteRequest) => ({
        quoteRequest: input,
        quote: { depositAddress, amountIn: input.amount, minAmountOut: '1200000', deadline: input.deadline },
    });
    const post = (body: object = payload, bearer = 'alice') =>
        request(app.getHttpServer()).post(endpoint).set('Authorization', `Bearer ${bearer}`).send(body);

    beforeEach(async () => {
        jest.resetAllMocks();
        auth.authenticateToken.mockImplementation(async (bearer: string) => {
            if (!['alice', 'bob'].includes(bearer)) throw new UnauthorizedException();
            return { id: bearer, privyUserId: bearer, sessionId: 'session', passkeyEnabled: false };
        });
        auth.walletsForUser.mockImplementation(async (user: string) => (user === 'alice' ? [wallet] : []));
        provider.getTokens.mockResolvedValue([token]);
        provider.createQuote.mockImplementation(async (input: OneClickQuoteRequest) => quote(input));
        const fixture = await Test.createTestingModule({
            imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), DepositsModule],
        })
            .overrideModule(AuthModule)
            .useModule(TestAuthModule)
            .overrideProvider(OneClickApiHttpClient)
            .useValue(provider)
            .compile();
        app = fixture.createNestApplication();
        app.use(cookieParser());
        app.enableVersioning({ type: VersioningType.URI });
        app.setGlobalPrefix('/api');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();
    });

    afterEach(async () => {
        await app?.close();
    });

    it('routes an authenticated request through the registry and adapters into the host response contract', async () => {
        const response = await post().expect(201);
        expect(auth.walletsForUser).toHaveBeenCalledWith('alice');
        expect(provider.createQuote).toHaveBeenCalledWith(
            expect.objectContaining({
                dry: false,
                swapType: 'EXACT_INPUT',
                amount: '1250000',
                originAsset: token.assetId,
                destinationAsset: token.assetId,
                depositType: 'ORIGIN_CHAIN',
                recipientType: 'DESTINATION_CHAIN',
                refundType: 'ORIGIN_CHAIN',
                recipient: wallet.address,
                refundTo: wallet.address,
            }),
        );
        expect(response.body).toEqual({
            data: {
                ...payload,
                network: 'eip155:8453',
                recipient: wallet.address,
                address: depositAddress,
                minimumReceived: '1.2',
                expiresAt: expect.any(String),
            },
        });
        expect(Date.parse(response.body.data.expiresAt)).toBeGreaterThan(Date.now());
    });

    it('rejects missing, invalid and cookie-only credentials before provider allocation', async () => {
        await request(app.getHttpServer()).post(endpoint).send(payload).expect(401);
        await post(payload, 'invalid').expect(401);
        await request(app.getHttpServer()).post(endpoint).set('Cookie', 'privy-token=alice').send(payload).expect(401);
        expect(provider.createQuote).not.toHaveBeenCalled();
    });

    it('rejects another user’s wallet and inactive or non-primary links', async () => {
        await post(payload, 'bob').expect(409);
        for (const change of [{ isPrimary: false }, { status: 'deleted' }, { deletedAt: new Date() }]) {
            auth.walletsForUser.mockResolvedValue([{ ...wallet, ...change }]);
            await post().expect(409);
        }
        expect(provider.createQuote).not.toHaveBeenCalled();
    });

    it.each([
        { amount: '0' },
        { amount: '-1' },
        { amount: '1e6' },
        { amount: 1 },
        { amount: '0.0000001' },
        { amount: '1'.repeat(81) },
        { walletId: 'not-a-uuid' },
        { assetId: '' },
        { assetId: 'unknown' },
    ])('rejects invalid input before allocating: %j', async (change) => {
        await post({ ...payload, ...change }).expect(400);
        expect(provider.createQuote).not.toHaveBeenCalled();
    });

    it('does not let client fields override server routing and wallet authority', async () => {
        await post({
            ...payload,
            recipient: depositAddress,
            refundTo: depositAddress,
            dry: true,
            deadline: '2099-01-01',
        }).expect(201);
        expect(provider.createQuote).toHaveBeenCalledWith(
            expect.objectContaining({
                recipient: wallet.address,
                refundTo: wallet.address,
                dry: false,
            }),
        );
    });

    it('revalidates the selected wallet after an in-flight provider response', async () => {
        provider.createQuote.mockImplementation(async (input: OneClickQuoteRequest) => {
            auth.walletsForUser.mockResolvedValue([]);
            return quote(input);
        });
        await post().expect(409);
    });

    it.each(['recipient', 'expired', 'address', 'amount'])('rejects unsafe provider responses: %s', async (failure) => {
        provider.createQuote.mockImplementation(async (input: OneClickQuoteRequest) => {
            const result = quote(input);
            if (failure === 'recipient') result.quoteRequest = { ...input, recipient: depositAddress };
            if (failure === 'expired') result.quote.deadline = '2000-01-01T00:00:00Z';
            if (failure === 'address') result.quote.depositAddress = 'invalid';
            if (failure === 'amount') result.quote.amountIn = '1';
            return result;
        });
        const response = await post().expect(502);
        expect(response.body.data).toBeUndefined();
    });
});
