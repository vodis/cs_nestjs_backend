import {
    ConnectedSocket,
    MessageBody,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
} from '@nestjs/websockets';
import { Subscription } from 'rxjs';
import { WebSocket } from 'ws';
import { HyperliquidWsService } from '../../http-clients/hyperliquid-api/hyperliquid-ws.service';
import { MarketsService } from './markets.service';

interface ChartSubscribePayload {
    symbol?: string;
}

interface ClientSubscription {
    symbol: string;
    subscription: Subscription;
}

@WebSocketGateway({
    path: '/api/v1/markets/chart/ws',
    cors: {
        origin: true,
        credentials: true,
    },
})
export class MarketsChartGateway implements OnGatewayDisconnect {
    private readonly clientSubscriptions = new Map<WebSocket, ClientSubscription>();

    constructor(
        private readonly hyperliquidWsService: HyperliquidWsService,
        private readonly marketsService: MarketsService,
    ) {}

    handleDisconnect(client: WebSocket): void {
        this.unsubscribeClient(client);
    }

    @SubscribeMessage('subscribe')
    async handleSubscribe(
        @ConnectedSocket() client: WebSocket,
        @MessageBody() payload: ChartSubscribePayload,
    ): Promise<void> {
        this.unsubscribeClient(client);

        const symbol = payload?.symbol?.trim().toUpperCase();
        if (!symbol) {
            this.emit(client, 'error', { message: 'Symbol is required.' });
            return;
        }

        try {
            const context = await this.marketsService.getAssetContext(symbol);
            this.hyperliquidWsService.retain();

            const subscription = this.hyperliquidWsService.mids$.subscribe((mids) => {
                const price = Number(mids[symbol]);
                if (!Number.isFinite(price) || price <= 0) {
                    return;
                }

                this.emit(client, 'mid', {
                    symbol,
                    price,
                    change24hPercent: this.marketsService.calculateChange24hPercent(price, context.prevDayPx),
                });
            });

            this.clientSubscriptions.set(client, { symbol, subscription });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to subscribe to market stream.';
            this.emit(client, 'error', { message });
        }
    }

    @SubscribeMessage('unsubscribe')
    handleUnsubscribe(@ConnectedSocket() client: WebSocket): void {
        this.unsubscribeClient(client);
    }

    private unsubscribeClient(client: WebSocket): void {
        const entry = this.clientSubscriptions.get(client);
        if (!entry) {
            return;
        }

        entry.subscription.unsubscribe();
        this.clientSubscriptions.delete(client);
        this.hyperliquidWsService.release();
    }

    private emit(client: WebSocket, event: string, data: unknown): void {
        if (client.readyState !== WebSocket.OPEN) {
            return;
        }

        client.send(JSON.stringify({ event, data }));
    }
}
