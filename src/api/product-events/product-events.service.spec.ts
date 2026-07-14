import { BadRequestException } from '@nestjs/common';
import { ProductEvent } from '../../database/models/product-event.model';
import { PRODUCT_EVENTS_BATCH_LIMIT } from './dto/record-product-event.dto';
import { ProductEventInput, ProductEventsService } from './product-events.service';

function event(index: number): ProductEventInput {
    return {
        eventName: `test.event.${index}`,
        source: 'backend',
        status: 'succeeded',
    };
}

describe('ProductEventsService', () => {
    let service: ProductEventsService;

    beforeEach(() => {
        service = new ProductEventsService();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('persists and returns the accepted batch count', async () => {
        const bulkCreate = jest.spyOn(ProductEvent, 'bulkCreate').mockResolvedValue([]);
        const events = [event(1), event(2)];

        await expect(service.recordMany(events)).resolves.toBe(events.length);
        expect(bulkCreate).toHaveBeenCalledTimes(1);
        expect(bulkCreate.mock.calls[0][0]).toHaveLength(events.length);
    });

    it('rejects batches over the configured limit without dropping events', async () => {
        const bulkCreate = jest.spyOn(ProductEvent, 'bulkCreate').mockResolvedValue([]);
        const events = Array.from({ length: PRODUCT_EVENTS_BATCH_LIMIT + 1 }, (_value, index) => event(index));

        await expect(service.recordMany(events)).rejects.toBeInstanceOf(BadRequestException);
        expect(bulkCreate).not.toHaveBeenCalled();
    });

    it('logs sanitized operational auth telemetry failures after persistence', async () => {
        jest.spyOn(ProductEvent, 'create').mockResolvedValue({} as ProductEvent);
        const warn = jest.spyOn(service['logger'], 'warn').mockImplementation();

        await service.record({
            eventName: 'account.login.passkey',
            source: 'mfe-wallets',
            status: 'failed',
            reasonCode: 'invalid_authenticator_response',
            metadata: { message: 'Invalid authenticator response', token: 'secret-token' },
        });

        expect(warn).toHaveBeenCalledWith(
            'product telemetry auth signal event=account.login.passkey source=mfe-wallets ' +
                'status=failed reason=invalid_authenticator_response message=Invalid authenticator response',
        );
        expect(warn.mock.calls[0][0]).not.toContain('secret-token');
    });

    it('does not log successful product telemetry as an operational auth signal', async () => {
        jest.spyOn(ProductEvent, 'create').mockResolvedValue({} as ProductEvent);
        const warn = jest.spyOn(service['logger'], 'warn').mockImplementation();

        await service.record({
            eventName: 'account.login.passkey',
            source: 'backend',
            status: 'succeeded',
        });

        expect(warn).not.toHaveBeenCalled();
    });

    it('excludes passkey signup policy failures from real passkey login failures', async () => {
        Object.defineProperty(ProductEvent, 'sequelize', {
            configurable: true,
            value: {
                fn: jest.fn((name: string, value: unknown) => ({ name, value })),
                col: jest.fn((name: string) => name),
            },
        });
        jest.spyOn(ProductEvent, 'count').mockResolvedValue(0);
        jest.spyOn(ProductEvent, 'findAll').mockResolvedValue([
            {
                eventName: 'account.login.passkey',
                source: 'backend',
                status: 'succeeded',
                reasonCode: null,
                count: '2',
            },
            {
                eventName: 'account.login.passkey',
                source: 'mfe-wallets',
                status: 'failed',
                reasonCode: 'invalid_authenticator_response',
                count: '1',
            },
            {
                eventName: 'account.login.passkey',
                source: 'mfe-wallets',
                status: 'failed',
                reasonCode: 'signup_with_passkey_not_allowed',
                count: '1',
            },
        ] as never);

        const summary = await service.dailySummary(new Date('2026-07-13T12:00:00.000Z'));

        expect(summary.headline.passkeyLoginRealFailure).toEqual({
            numerator: 1,
            denominator: 4,
            percent: 25,
        });
        expect(summary.headline.passkeyLoginRawFailure).toEqual({
            numerator: 2,
            denominator: 4,
            percent: 50,
        });
    });
});
