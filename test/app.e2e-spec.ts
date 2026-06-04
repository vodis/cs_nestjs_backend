import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, RequestMethod } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Health (e2e)', () => {
    let app: INestApplication;

    beforeEach(async () => {
        process.env.CS_I18N_SERVICE_URL = process.env.CS_I18N_SERVICE_URL || 'http://127.0.0.1:1';
        process.env.DEFAULT_LANGUAGE = process.env.DEFAULT_LANGUAGE || 'en';
        process.env.COOKIES_DOMAIN = process.env.COOKIES_DOMAIN || 'localhost';

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.setGlobalPrefix('/api', {
            exclude: [{ path: '/health', method: RequestMethod.GET }],
        });
        await app.init();
    });

    afterEach(async () => {
        await app?.close();
    });

    it('/health (GET)', () => {
        return request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
    });
});
