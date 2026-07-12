import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ProductEventsController } from './product-events.controller';
import { ProductEventsService } from './product-events.service';

@Module({
    imports: [DatabaseModule],
    controllers: [ProductEventsController],
    providers: [ProductEventsService],
    exports: [ProductEventsService],
})
export class ProductEventsModule {}
