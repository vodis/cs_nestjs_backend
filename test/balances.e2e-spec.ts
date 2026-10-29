import { CanActivate, ExecutionContext, INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { BalancesController } from '../src/api/balances/balances.controller';
import { BalancesService } from '../src/api/balances/balances.service';
import { PrivyAuthGuard } from '../src/api/auth/privy-auth.guard';

describe('Balances (e2e)', () => {
    let app: INestApplication;
    const getBalances = jest.fn();

    const authGuard: CanActivate = {
        canActivate(context: ExecutionContext) {
            context.switchToHttp().getRequest().user = {
                id: '11111111-1111-4111-8111-111111111111',
                providerUserId: 'did:privy:test',
            };
            return true;
        },
    };

    beforeEach(async () => {
        getBalances.mockResolvedValue({
            data: [],
            meta: { source: 'postgres_cache', cached: true, fetchedAt: new Date().toISOString(), partial: false },
        });
        const moduleFixture: TestingModule = await Test.createTestingModule({
            controllers: [BalancesController],
            providers: [{ provide: BalancesService, useValue: { getBalances } }],
        })
            .overrideGuard(PrivyAuthGuard)
            .useValue(authGuard)
            .compile();

        app = moduleFixture.createNestApplication();
        app.enableVersioning({ type: VersioningType.URI });
        app.setGlobalPrefix('/api');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();
    });

    afterEach(async () => {
        jest.clearAllMocks();
        await app.close();
    });

    it('accepts an allowlisted-size asset batch and forwards the authenticated user', async () => {
        await request(app.getHttpServer())
            .post('/api/v1/balances')
            .send({ network: 'eip155:8453', assetIds: ['asset-a', 'asset-b'] })
            .expect(201);

        expect(getBalances).toHaveBeenCalledWith(
            expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111' }),
            { network: 'eip155:8453', assetIds: ['asset-a', 'asset-b'] },
        );
    });

    it('rejects more than 20 asset ids before invoking the service', async () => {
        await request(app.getHttpServer())
            .post('/api/v1/balances')
            .send({ network: 'near:mainnet', assetIds: Array.from({ length: 21 }, (_, index) => `asset-${index}`) })
            .expect(400);

        expect(getBalances).not.toHaveBeenCalled();
    });
});
