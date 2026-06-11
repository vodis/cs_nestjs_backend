import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as request from 'supertest';
import { SwapsModule } from '../src/modules/swaps';
import { ASSET_REGISTRY_PORT } from '../src/modules/swaps/application/ports/asset-registry.port';
import { QUOTE_PROVIDERS, QuoteProviderPort } from '../src/modules/swaps/application/ports/quote-provider.port';
import { SwapQuote } from '../src/modules/swaps/domain/models/swap-quote';

const ORIGIN_ASSET = 'nep141:wrap.near';
const DESTINATION_ASSET = 'nep141:usdt.tether-token.near';
const EVM_SIGNER = '0x380b8fa1ebfe8a652dbb55c5a7dec2c683bbd8b9';
const NEAR_SIGNER = 'alice.near';

type CreateSwapsAppOptions = {
    assets?: Record<string, { price?: string } | null>;
    providers?: QuoteProviderPort[];
    maxSlippageBps?: number;
};

function futureDeadline(msFromNow = 60_000): string {
    return new Date(Date.now() + msFromNow).toISOString();
}

function executableQuote(overrides: Partial<SwapQuote> = {}): SwapQuote {
    return {
        providerId: 'solver-relay',
        executionMode: 'intent_sign',
        quoteHashes: ['0xquote-hash'],
        originAsset: ORIGIN_ASSET,
        destinationAsset: DESTINATION_ASSET,
        amountIn: '1000000',
        amountOut: '999000',
        expirationTime: futureDeadline(),
        ...overrides,
    };
}

function validPreparePayload(overrides: Record<string, unknown> = {}) {
    return {
        originAsset: ORIGIN_ASSET,
        destinationAsset: DESTINATION_ASSET,
        amount: '1000000',
        swapType: 'EXACT_INPUT',
        slippageTolerance: 100,
        deadline: futureDeadline(),
        signerId: EVM_SIGNER,
        authMethod: 'evm',
        ...overrides,
    };
}

function defaultAssetRegistry(assets?: CreateSwapsAppOptions['assets']) {
    const registry =
        assets ??
        ({
            [ORIGIN_ASSET]: { price: '1' },
            [DESTINATION_ASSET]: { price: '1' },
        } as Record<string, { price?: string } | null>);

    return {
        findById: jest.fn(async (assetId: string) => {
            const entry = registry[assetId];

            if (!entry) {
                return undefined;
            }

            return {
                assetId,
                defuseAssetId: assetId,
                symbol: assetId.includes('wrap') ? 'wNEAR' : 'USDC',
                decimals: assetId.includes('wrap') ? 24 : 6,
                blockchain: 'near',
                price: entry.price ?? '1',
            };
        }),
    };
}

function defaultProviders(quotes: SwapQuote[] = [executableQuote()]): QuoteProviderPort[] {
    return [
        {
            providerId: 'solver-relay',
            requestQuotes: jest.fn().mockResolvedValue(quotes),
        },
    ];
}

async function createSwapsApp(options: CreateSwapsAppOptions = {}): Promise<INestApplication> {
    const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [
            ConfigModule.forRoot({
                isGlobal: true,
                load: [
                    () => ({
                        SWAP_MAX_SLIPPAGE_BPS: options.maxSlippageBps ?? 1000,
                        SWAP_MIN_DEADLINE_MS: 60000,
                    }),
                ],
            }),
            SwapsModule,
        ],
    })
        .overrideProvider(ASSET_REGISTRY_PORT)
        .useValue(defaultAssetRegistry(options.assets))
        .overrideProvider(QUOTE_PROVIDERS)
        .useValue(options.providers ?? defaultProviders())
        .compile();

    const app = moduleFixture.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI });
    app.setGlobalPrefix('/api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    return app;
}

describe('Swaps (e2e)', () => {
    describe('POST /api/v1/swaps/prepare — success', () => {
        let app: INestApplication;

        afterEach(async () => {
            if (app) {
                await app.close();
            }
        });

        it('returns an approved prepare package for EVM intent signing', async () => {
            app = await createSwapsApp();

            const response = await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(validPreparePayload())
                .expect(201);

            expect(response.body.data).toMatchObject({
                providerId: 'solver-relay',
                quoteHashes: ['0xquote-hash'],
                signatureStandard: 'erc191',
                authMethod: 'evm',
                signerId: EVM_SIGNER,
                amountIn: '1000000',
                amountOut: '999000',
                slippageTolerance: 100,
                tokenDeltas: {
                    [ORIGIN_ASSET]: '-1000000',
                    [DESTINATION_ASSET]: '999000',
                },
                intents: [
                    {
                        intent: 'token_diff',
                        diff: {
                            [ORIGIN_ASSET]: '-1000000',
                            [DESTINATION_ASSET]: '999000',
                        },
                    },
                ],
            });
            expect(response.body.data.deadline).toEqual(expect.any(String));
            expect(response.body.data.quoteExpiration).toEqual(expect.any(String));
        });

        it('returns nep413 signature standard for NEAR auth', async () => {
            app = await createSwapsApp();

            const response = await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(
                    validPreparePayload({
                        signerId: NEAR_SIGNER,
                        authMethod: 'near',
                    }),
                )
                .expect(201);

            expect(response.body.data).toMatchObject({
                authMethod: 'near',
                signerId: NEAR_SIGNER,
                signatureStandard: 'nep413',
            });
        });

        it('selects the best executable quote across multiple providers', async () => {
            app = await createSwapsApp({
                providers: [
                    {
                        providerId: 'one-click',
                        requestQuotes: jest.fn().mockResolvedValue([
                            executableQuote({
                                providerId: 'one-click',
                                quoteHashes: ['0xone-click'],
                                amountOut: '900000',
                            }),
                        ]),
                    },
                    {
                        providerId: 'solver-relay',
                        requestQuotes: jest.fn().mockResolvedValue([
                            executableQuote({
                                providerId: 'solver-relay',
                                quoteHashes: ['0xsolver-better'],
                                amountOut: '999000',
                            }),
                        ]),
                    },
                ],
            });

            const response = await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(validPreparePayload())
                .expect(201);

            expect(response.body.data).toMatchObject({
                providerId: 'solver-relay',
                quoteHashes: ['0xsolver-better'],
                amountOut: '999000',
            });
        });

        it('ignores deposit-only provider quotes when an executable provider is available', async () => {
            app = await createSwapsApp({
                providers: [
                    {
                        providerId: 'one-click',
                        requestQuotes: jest.fn().mockResolvedValue([
                            {
                                providerId: 'one-click',
                                executionMode: 'deposit_address',
                                quoteHashes: [],
                                originAsset: ORIGIN_ASSET,
                                destinationAsset: DESTINATION_ASSET,
                                amountIn: '1000000',
                                amountOut: '9999999',
                                expirationTime: futureDeadline(),
                            },
                        ]),
                    },
                    {
                        providerId: 'solver-relay',
                        requestQuotes: jest.fn().mockResolvedValue([executableQuote({ amountOut: '999000' })]),
                    },
                ],
            });

            const response = await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(validPreparePayload())
                .expect(201);

            expect(response.body.data.providerId).toBe('solver-relay');
            expect(response.body.data.amountOut).toBe('999000');
        });

        it('succeeds when one provider fails but another returns executable quotes', async () => {
            app = await createSwapsApp({
                providers: [
                    {
                        providerId: 'one-click',
                        requestQuotes: jest.fn().mockRejectedValue(new Error('upstream down')),
                    },
                    {
                        providerId: 'solver-relay',
                        requestQuotes: jest.fn().mockResolvedValue([executableQuote()]),
                    },
                ],
            });

            await request(app.getHttpServer()).post('/api/v1/swaps/prepare').send(validPreparePayload()).expect(201);
        });

        it('accepts EXACT_OUTPUT swap type', async () => {
            app = await createSwapsApp({
                providers: defaultProviders([
                    executableQuote({
                        amountIn: '500000',
                        amountOut: '500000',
                    }),
                ]),
            });

            const response = await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(
                    validPreparePayload({
                        swapType: 'EXACT_OUTPUT',
                        amount: '500000',
                    }),
                )
                .expect(201);

            expect(response.body.data.amountOut).toBe('500000');
        });
    });

    describe('POST /api/v1/swaps/prepare — request validation (DTO)', () => {
        let app: INestApplication;

        beforeEach(async () => {
            app = await createSwapsApp();
        });

        afterEach(async () => {
            await app.close();
        });

        it('rejects missing required fields', async () => {
            const response = await request(app.getHttpServer()).post('/api/v1/swaps/prepare').send({}).expect(400);

            expect(response.body.message).toEqual(expect.any(Array));
        });

        it('rejects non-positive amount strings', async () => {
            await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(validPreparePayload({ amount: '0' }))
                .expect(400);

            await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(validPreparePayload({ amount: '-100' }))
                .expect(400);

            await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(validPreparePayload({ amount: '1.5' }))
                .expect(400);
        });

        it('rejects invalid swapType and authMethod', async () => {
            await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(validPreparePayload({ swapType: 'MARKET' }))
                .expect(400);

            await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(validPreparePayload({ authMethod: 'solana' }))
                .expect(400);
        });

        it('rejects invalid ISO deadline format', async () => {
            await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(validPreparePayload({ deadline: 'not-a-date' }))
                .expect(400);
        });

        it('strips unknown fields from the request body', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send({
                    ...validPreparePayload(),
                    unexpectedField: 'should-be-removed',
                })
                .expect(201);

            expect(response.body.data.quoteHashes).toEqual(['0xquote-hash']);
        });
    });

    describe('POST /api/v1/swaps/prepare — domain validation', () => {
        let app: INestApplication;

        afterEach(async () => {
            if (app) {
                await app.close();
            }
        });

        it('rejects unsupported assets not in the allowlist', async () => {
            app = await createSwapsApp({
                assets: {
                    [ORIGIN_ASSET]: { price: '2' },
                },
            });

            const response = await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(validPreparePayload())
                .expect(400);

            expect(response.body).toMatchObject({
                code: 'UNSUPPORTED_ASSET',
                message: expect.stringContaining('allowlist'),
                details: { assetId: DESTINATION_ASSET },
            });
        });

        it('rejects identical origin and destination assets', async () => {
            app = await createSwapsApp();

            const response = await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(
                    validPreparePayload({
                        destinationAsset: ORIGIN_ASSET,
                    }),
                )
                .expect(400);

            expect(response.body).toMatchObject({
                code: 'UNSUPPORTED_PAIR',
            });
        });

        it('rejects invalid EVM signerId', async () => {
            app = await createSwapsApp();

            const response = await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(validPreparePayload({ signerId: 'not-an-evm-address' }))
                .expect(400);

            expect(response.body).toMatchObject({
                code: 'INVALID_SIGNER',
            });
        });

        it('rejects invalid NEAR signerId', async () => {
            app = await createSwapsApp();

            const response = await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(
                    validPreparePayload({
                        signerId: 'bad-account',
                        authMethod: 'near',
                    }),
                )
                .expect(400);

            expect(response.body).toMatchObject({
                code: 'INVALID_SIGNER',
            });
        });

        it('rejects past deadlines', async () => {
            app = await createSwapsApp();

            const response = await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(
                    validPreparePayload({
                        deadline: new Date(Date.now() - 60_000).toISOString(),
                    }),
                )
                .expect(400);

            expect(response.body).toMatchObject({
                code: 'INVALID_DEADLINE',
            });
        });

        it('rejects slippage above configured maximum', async () => {
            app = await createSwapsApp({ maxSlippageBps: 500 });

            const response = await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(validPreparePayload({ slippageTolerance: 501 }))
                .expect(400);

            expect(response.body).toMatchObject({
                code: 'SLIPPAGE_OUT_OF_RANGE',
                details: expect.objectContaining({
                    maxSlippageBps: 500,
                }),
            });
        });

        it('rejects quotes that exceed slippage tolerance against registry prices', async () => {
            app = await createSwapsApp({
                assets: {
                    [ORIGIN_ASSET]: { price: '2' },
                    [DESTINATION_ASSET]: { price: '1' },
                },
                providers: defaultProviders([
                    executableQuote({
                        amountIn: '1000000',
                        amountOut: '1000000',
                    }),
                ]),
            });

            const response = await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(validPreparePayload({ slippageTolerance: 100 }))
                .expect(400);

            expect(response.body).toMatchObject({
                code: 'SLIPPAGE_EXCEEDED',
                details: expect.objectContaining({
                    providerId: 'solver-relay',
                    slippageTolerance: 100,
                }),
            });
        });
    });

    describe('POST /api/v1/swaps/prepare — provider orchestration', () => {
        let app: INestApplication;

        afterEach(async () => {
            if (app) {
                await app.close();
            }
        });

        it('returns 400 when no provider returns executable quote hashes', async () => {
            app = await createSwapsApp({
                providers: [
                    {
                        providerId: 'one-click',
                        requestQuotes: jest.fn().mockResolvedValue([
                            {
                                providerId: 'one-click',
                                executionMode: 'deposit_address',
                                quoteHashes: [],
                                originAsset: ORIGIN_ASSET,
                                destinationAsset: DESTINATION_ASSET,
                                amountIn: '1000000',
                                amountOut: '999000',
                                expirationTime: futureDeadline(),
                            },
                        ]),
                    },
                ],
            });

            const response = await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(validPreparePayload())
                .expect(400);

            expect(response.body).toMatchObject({
                code: 'INSUFFICIENT_LIQUIDITY',
            });
        });

        it('returns 503 when all quote providers fail', async () => {
            app = await createSwapsApp({
                providers: [
                    {
                        providerId: 'one-click',
                        requestQuotes: jest.fn().mockRejectedValue(new Error('upstream down')),
                    },
                    {
                        providerId: 'solver-relay',
                        requestQuotes: jest.fn().mockRejectedValue(new Error('upstream down')),
                    },
                ],
            });

            const response = await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(validPreparePayload())
                .expect(503);

            expect(response.body.message).toMatch(/temporarily unavailable/i);
        });

        it('returns 503 when providers respond with empty quote lists', async () => {
            app = await createSwapsApp({
                providers: [
                    {
                        providerId: 'solver-relay',
                        requestQuotes: jest.fn().mockResolvedValue([]),
                    },
                ],
            });

            const response = await request(app.getHttpServer())
                .post('/api/v1/swaps/prepare')
                .send(validPreparePayload())
                .expect(503);

            expect(response.body.message).toMatch(/temporarily unavailable/i);
        });
    });
});
