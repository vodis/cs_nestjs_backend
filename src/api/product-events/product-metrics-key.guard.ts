import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

@Injectable()
export class ProductMetricsKeyGuard implements CanActivate {
    constructor(private readonly config: ConfigService) {}

    canActivate(context: ExecutionContext): boolean {
        const expectedKey = this.config.get<string>('PRODUCT_METRICS_API_KEY')?.trim();
        const providedKey = this.headerValue(
            context.switchToHttp().getRequest<Request>().headers['x-product-metrics-key'],
        );

        if (!expectedKey || !providedKey || !secureCompare(providedKey, expectedKey)) {
            throw new UnauthorizedException('Missing or invalid product metrics key');
        }

        return true;
    }

    private headerValue(value: Request['headers'][string]): string | undefined {
        if (Array.isArray(value)) {
            return value[0]?.trim() || undefined;
        }
        return value?.trim() || undefined;
    }
}

function secureCompare(value: string, expected: string): boolean {
    const valueBuffer = Buffer.from(value);
    const expectedBuffer = Buffer.from(expected);

    return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
}
