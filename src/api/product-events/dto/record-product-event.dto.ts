import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsISO8601,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    ValidateNested,
} from 'class-validator';

export const PRODUCT_EVENT_SOURCES = ['backend', 'mfe-wallets', 'app-client'] as const;
export const PRODUCT_EVENT_STATUSES = ['attempted', 'succeeded', 'failed', 'cancelled'] as const;
export const PRODUCT_EVENTS_BATCH_LIMIT = 50;

export class RecordProductEventDto {
    @IsString()
    @MaxLength(120)
    eventName: string;

    @IsIn(PRODUCT_EVENT_SOURCES)
    source: (typeof PRODUCT_EVENT_SOURCES)[number];

    @IsIn(PRODUCT_EVENT_STATUSES)
    status: (typeof PRODUCT_EVENT_STATUSES)[number];

    @IsOptional()
    @IsUUID()
    userId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(160)
    anonymousId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(160)
    sessionId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(160)
    requestId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    reasonCode?: string;

    @IsOptional()
    @IsObject()
    metadata?: Record<string, unknown>;

    @IsOptional()
    @IsISO8601()
    occurredAt?: string;
}

export class RecordProductEventsDto {
    @IsArray()
    @ArrayMaxSize(PRODUCT_EVENTS_BATCH_LIMIT)
    @ValidateNested({ each: true })
    @Type(() => RecordProductEventDto)
    events: RecordProductEventDto[];
}
