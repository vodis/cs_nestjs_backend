import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ProductMetricsKeyGuard } from './product-metrics-key.guard';
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
        const count = await this.productEvents.recordMany(body.events);
        return { accepted: true, count };
    }

    @Get('daily-summary')
    @UseGuards(ProductMetricsKeyGuard)
    async dailySummary() {
        return this.productEvents.dailySummary();
    }
}
