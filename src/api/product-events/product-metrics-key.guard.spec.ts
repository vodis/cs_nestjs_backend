import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductMetricsKeyGuard } from './product-metrics-key.guard';

function guard(values: Record<string, string | undefined>) {
    return new ProductMetricsKeyGuard(new ConfigService(values));
}

function context(headers: Record<string, string | string[] | undefined>): ExecutionContext {
    return {
        switchToHttp: () => ({
            getRequest: () => ({ headers }),
        }),
    } as unknown as ExecutionContext;
}

describe('ProductMetricsKeyGuard', () => {
    it('allows requests with the configured product metrics key', () => {
        expect(
            guard({ PRODUCT_METRICS_API_KEY: 'metrics-secret' }).canActivate(
                context({ 'x-product-metrics-key': 'metrics-secret' }),
            ),
        ).toBe(true);
    });

    it('rejects requests when the key is missing or invalid', () => {
        expect(() => guard({ PRODUCT_METRICS_API_KEY: 'metrics-secret' }).canActivate(context({}))).toThrow(
            UnauthorizedException,
        );
        expect(() =>
            guard({ PRODUCT_METRICS_API_KEY: 'metrics-secret' }).canActivate(
                context({ 'x-product-metrics-key': 'wrong-secret' }),
            ),
        ).toThrow(UnauthorizedException);
    });

    it('rejects all requests when the product metrics key is not configured', () => {
        expect(() => guard({}).canActivate(context({ 'x-product-metrics-key': 'metrics-secret' }))).toThrow(
            UnauthorizedException,
        );
    });
});
