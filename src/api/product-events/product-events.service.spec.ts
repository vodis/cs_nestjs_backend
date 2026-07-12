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
});
