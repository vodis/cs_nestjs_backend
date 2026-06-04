import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as request from 'supertest';
import { AssetsModule } from '../src/api/assets/assets.module';
import { OneClickApiHttpClient } from '../src/http-clients/one-click-api/one-click-api.http-client';

describe('Assets (e2e)', () => {
    let app: INestApplication;

    beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [ConfigModule.forRoot({ isGlobal: true }), AssetsModule],
        })
            .overrideProvider(OneClickApiHttpClient)
            .useValue({
                getTokens: jest.fn().mockResolvedValue([
                    {
                        assetId: 'nep141:wrap.near',
                        decimals: 24,
                        blockchain: 'near',
                        symbol: 'wNEAR',
                        contractAddress: 'wrap.near',
                    },
                ]),
            })
            .compile();

        app = moduleFixture.createNestApplication();
        app.enableVersioning({ type: VersioningType.URI });
        app.setGlobalPrefix('/api');
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    it('/api/v1/assets (GET)', () => {
        return request(app.getHttpServer())
            .get('/api/v1/assets')
            .expect(200)
            .expect(({ body }) => {
                expect(body).toEqual({
                    data: [
                        {
                            assetId: 'nep141:wrap.near',
                            defuseAssetId: 'nep141:wrap.near',
                            symbol: 'wNEAR',
                            name: 'NEAR Protocol',
                            icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/6535.png',
                            decimals: 24,
                            blockchain: 'near',
                            contractAddress: 'wrap.near',
                        },
                    ],
                    meta: {
                        source: '1click',
                        cached: false,
                        fetchedAt: expect.any(String),
                    },
                });
            });
    });
});
