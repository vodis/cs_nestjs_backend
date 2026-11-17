import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AgentAccessService } from '../src/modules/agent-access/application/agent-access.service';
import { AgentOauthController } from '../src/modules/agent-access/presentation/agent-oauth.controller';
import { AgentAuthorizeRateLimitGuard } from '../src/modules/agent-access/presentation/agent-authorize-rate-limit.guard';

describe('PR #283: authorization admission limit', () => {
    let app: INestApplication;
    const beginBrowserAuthorization = jest.fn(async () => 'https://app.example/consent');
    let now: jest.SpyInstance;

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [AgentOauthController],
            providers: [
                AgentAuthorizeRateLimitGuard,
                { provide: AgentAccessService, useValue: { beginBrowserAuthorization } },
            ],
        }).compile();
        app = module.createNestApplication();
        await app.init();
        now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    });

    afterAll(async () => {
        now?.mockRestore();
        await app?.close();
    });

    it('rejects excess requests before service work despite rotating IDs/headers, then recovers', async () => {
        for (let i = 0; i < 120; i++) {
            await request(app.getHttpServer())
                .get('/oauth/authorize')
                .query({ client_id: `https://client${i}.example/client.json`, scope: 'portfolio:read' })
                .set('X-Forwarded-For', `192.0.2.${i}`)
                .expect(302);
        }
        await request(app.getHttpServer())
            .get('/oauth/authorize')
            .expect(429)
            .expect('Retry-After', '60')
            .expect({ error: 'temporarily_unavailable' });
        expect(beginBrowserAuthorization).toHaveBeenCalledTimes(120);
        now.mockReturnValue(1_059_000);
        await request(app.getHttpServer()).get('/oauth/authorize').expect(429).expect('Retry-After', '1');
        now.mockReturnValue(1_060_000);
        await request(app.getHttpServer()).get('/oauth/authorize').query({ scope: 'portfolio:read' }).expect(302);
        expect(beginBrowserAuthorization).toHaveBeenCalledTimes(121);
    });
});
