import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, RequestMethod } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Health (e2e)', () => {
    let app: INestApplication;

    beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
    beforeEach(async () => {
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
        await app.close();
    });

    it('/health (GET)', () => {
        return request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
    });
});
