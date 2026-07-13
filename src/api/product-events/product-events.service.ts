import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Op } from 'sequelize';
import { ProductEvent } from '../../database/models/product-event.model';
import { PRODUCT_EVENTS_BATCH_LIMIT, RecordProductEventDto } from './dto/record-product-event.dto';

export type ProductEventInput = Omit<RecordProductEventDto, 'occurredAt'> & {
    occurredAt?: Date | string;
};

export type MetricRatio = {
    numerator: number;
    denominator: number;
    percent: number | null;
};

export type DailyProductMetricsSummary = {
    window: {
        from: string;
        to: string;
    };
    headline: {
        accountsCreated: number;
        swapQuoteToConfirmed: MetricRatio;
        depositSuccess: MetricRatio;
        withdrawalSuccess: MetricRatio;
        walletConnectFailure: MetricRatio;
        passkeyLoginRealFailure: MetricRatio;
        passkeyLoginRawFailure: MetricRatio;
    };
};

@Injectable()
export class ProductEventsService {
    private readonly logger = new Logger(ProductEventsService.name);

    async record(input: ProductEventInput): Promise<void> {
        const modelInput = this.toModelInput(input);
        await ProductEvent.create(modelInput);
        this.logOperationalAuthSignal(modelInput);
    }

    async recordMany(inputs: ProductEventInput[]): Promise<number> {
        if (inputs.length === 0) {
            return 0;
        }
        if (inputs.length > PRODUCT_EVENTS_BATCH_LIMIT) {
            throw new BadRequestException(
                `Product event batches may include at most ${PRODUCT_EVENTS_BATCH_LIMIT} events`,
            );
        }
        const modelInputs = inputs.map((input) => this.toModelInput(input));
        await ProductEvent.bulkCreate(modelInputs);
        modelInputs.forEach((input) => this.logOperationalAuthSignal(input));
        return inputs.length;
    }

    async recordBestEffort(input: ProductEventInput): Promise<void> {
        try {
            await this.record(input);
        } catch (error) {
            this.logger.warn(
                `product telemetry write failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    async dailySummary(now = new Date()): Promise<DailyProductMetricsSummary> {
        const to = now;
        const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);

        const counts = await this.countByEventAndStatus(from, to);
        const accountsCreated = await this.count('account.created', 'succeeded', from, to);
        const passkeySuccess = this.value(counts, 'account.login.passkey', 'succeeded', 'backend');
        const passkeyFailure = this.value(counts, 'account.login.passkey', 'failed', 'mfe-wallets');
        const passkeySignupPolicyFailure = this.value(
            counts,
            'account.login.passkey',
            'failed',
            'mfe-wallets',
            'signup_with_passkey_not_allowed',
        );
        const passkeyRealFailure = Math.max(0, passkeyFailure - passkeySignupPolicyFailure);
        const passkeyRawFailure =
            passkeyFailure + this.value(counts, 'account.login.passkey', 'cancelled', 'mfe-wallets');
        const passkeyTotal = passkeySuccess + passkeyRawFailure;
        const walletConnectSuccess = this.value(counts, 'wallet.connect', 'succeeded', 'mfe-wallets');
        const walletConnectFailure = this.value(counts, 'wallet.connect', 'failed', 'mfe-wallets');
        const walletConnectTotal = walletConnectSuccess + walletConnectFailure;
        const swapQuoteSuccess = this.value(counts, 'swap.quote', 'succeeded', 'backend');
        const swapConfirmed = this.value(counts, 'swap.confirmed', 'succeeded', 'app-client');
        const depositStarted = this.value(counts, 'deposit.started', 'succeeded', 'backend');
        const depositSuccess = this.value(counts, 'deposit.completed', 'succeeded', 'backend');
        const withdrawalStarted = this.value(counts, 'withdrawal.started', 'succeeded', 'backend');
        const withdrawalSuccess = this.value(counts, 'withdrawal.completed', 'succeeded', 'backend');

        return {
            window: {
                from: from.toISOString(),
                to: to.toISOString(),
            },
            headline: {
                accountsCreated,
                swapQuoteToConfirmed: ratio(swapConfirmed, swapQuoteSuccess),
                depositSuccess: ratio(depositSuccess, depositStarted),
                withdrawalSuccess: ratio(withdrawalSuccess, withdrawalStarted),
                walletConnectFailure: ratio(walletConnectFailure, walletConnectTotal),
                passkeyLoginRealFailure: ratio(passkeyRealFailure, passkeyTotal),
                passkeyLoginRawFailure: ratio(passkeyRawFailure, passkeyTotal),
            },
        };
    }

    private async count(eventName: string, status: string, from: Date, to: Date): Promise<number> {
        return ProductEvent.count({
            where: {
                eventName,
                status,
                createdAt: { [Op.gte]: from, [Op.lt]: to },
            },
        });
    }

    private async countByEventAndStatus(from: Date, to: Date): Promise<Map<string, number>> {
        const rows = (await ProductEvent.findAll({
            attributes: [
                'eventName',
                'source',
                'status',
                'reasonCode',
                [ProductEvent.sequelize!.fn('COUNT', ProductEvent.sequelize!.col('id')), 'count'],
            ],
            where: { createdAt: { [Op.gte]: from, [Op.lt]: to } },
            group: ['eventName', 'source', 'status', 'reasonCode'],
            raw: true,
        })) as unknown as Array<{
            eventName: string;
            source: string;
            status: string;
            reasonCode: string | null;
            count: string | number;
        }>;

        const out = new Map<string, number>();
        rows.forEach((row) => {
            const aggregateKey = this.key(row.eventName, row.source, row.status);
            out.set(aggregateKey, (out.get(aggregateKey) ?? 0) + Number(row.count));
            if (row.reasonCode) {
                out.set(this.key(row.eventName, row.source, row.status, row.reasonCode), Number(row.count));
            }
        });
        return out;
    }

    private value(
        counts: Map<string, number>,
        eventName: string,
        status: string,
        source: string,
        reasonCode?: string,
    ): number {
        return counts.get(this.key(eventName, source, status, reasonCode)) ?? 0;
    }

    private key(eventName: string, source: string, status: string, reasonCode?: string): string {
        return reasonCode ? `${eventName}:${source}:${status}:${reasonCode}` : `${eventName}:${source}:${status}`;
    }

    private toModelInput(input: ProductEventInput) {
        return {
            eventName: input.eventName,
            source: input.source,
            status: input.status,
            userId: input.userId ?? null,
            anonymousId: input.anonymousId ?? null,
            sessionId: input.sessionId ?? null,
            requestId: input.requestId ?? null,
            reasonCode: input.reasonCode ?? null,
            metadata: sanitizeMetadata(input.metadata ?? {}),
            createdAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        };
    }

    private logOperationalAuthSignal(input: ReturnType<ProductEventsService['toModelInput']>): void {
        if (!isOperationalAuthSignal(input.eventName, input.status)) {
            return;
        }

        const message = typeof input.metadata.message === 'string' ? input.metadata.message.slice(0, 160) : undefined;
        this.logger.warn(
            [
                'product telemetry auth signal',
                `event=${input.eventName}`,
                `source=${input.source}`,
                `status=${input.status}`,
                `reason=${input.reasonCode ?? 'none'}`,
                message ? `message=${message}` : undefined,
            ]
                .filter(Boolean)
                .join(' '),
        );
    }
}

function isOperationalAuthSignal(eventName: string, status: string): boolean {
    return (
        (status === 'failed' || status === 'cancelled') &&
        (eventName === 'auth.login' || eventName === 'account.login.passkey' || eventName === 'account.passkey.link')
    );
}

function ratio(numerator: number, denominator: number): MetricRatio {
    return {
        numerator,
        denominator,
        percent: denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : null,
    };
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const denied = ['token', 'accessToken', 'refreshToken', 'authorization', 'password', 'secret'];
    return Object.fromEntries(
        Object.entries(metadata)
            .filter(([key]) => !denied.some((item) => key.toLowerCase().includes(item.toLowerCase())))
            .slice(0, 40),
    );
}
