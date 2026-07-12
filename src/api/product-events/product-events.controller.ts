import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { RecordProductEventDto, RecordProductEventsDto } from './dto/record-product-event.dto';
import { ProductEventsService } from './product-events.service';

@Controller({ version: '1', path: 'product-events' })
export class ProductEventsController {
    constructor(private readonly productEvents: ProductEventsService) {}

    @Post()
    @HttpCode(202)
    async record(@Body() body: RecordProductEventDto): Promise<{ accepted: true }> {
        await this.productEvents.record(body);
        return { accepted: true };
    }

    @Post('batch')
    @HttpCode(202)
    async recordBatch(@Body() body: RecordProductEventsDto): Promise<{ accepted: true; count: number }> {
        await this.productEvents.recordMany(body.events ?? []);
        return { accepted: true, count: body.events?.length ?? 0 };
    }

    @Get('daily-summary')
    async dailySummary() {
        return this.productEvents.dailySummary();
    }
}
