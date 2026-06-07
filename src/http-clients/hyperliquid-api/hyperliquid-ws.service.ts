import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Subject } from 'rxjs';
import { WebSocket } from 'ws';

interface HyperliquidAllMidsMessage {
    channel?: string;
    data?: {
        mids?: Record<string, string>;
    };
}

@Injectable()
export class HyperliquidWsService implements OnModuleDestroy {
    private ws?: WebSocket;
    private refCount = 0;
    private reconnectTimer?: ReturnType<typeof setTimeout>;
    private readonly midsSubject = new Subject<Record<string, string>>();

    readonly mids$ = this.midsSubject.asObservable();

    constructor(private readonly configService: ConfigService) {}

    retain(): void {
        this.refCount += 1;

        if (this.refCount === 1) {
            this.connect();
        }
    }

    release(): void {
        this.refCount = Math.max(0, this.refCount - 1);

        if (this.refCount === 0) {
            this.disconnect();
        }
    }

    onModuleDestroy(): void {
        this.disconnect();
    }

    private connect(): void {
        const url = this.configService.get<string>('HYPERLIQUID_WS_URL') || 'wss://api.hyperliquid.xyz/ws';
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            this.ws?.send(
                JSON.stringify({
                    method: 'subscribe',
                    subscription: { type: 'allMids' },
                }),
            );
        });

        this.ws.on('message', (raw) => {
            const message = parseAllMidsMessage(raw.toString());
            if (message) {
                this.midsSubject.next(message);
            }
        });

        this.ws.on('close', () => {
            this.ws = undefined;

            if (this.refCount > 0) {
                this.reconnectTimer = setTimeout(() => this.connect(), 2000);
            }
        });

        this.ws.on('error', () => {
            this.ws?.close();
        });
    }

    private disconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }

        this.ws?.close();
        this.ws = undefined;
    }
}

function parseAllMidsMessage(raw: string): Record<string, string> | undefined {
    try {
        const message = JSON.parse(raw) as HyperliquidAllMidsMessage;
        if (message.channel !== 'allMids' || !message.data?.mids) {
            return undefined;
        }

        return message.data.mids;
    } catch {
        return undefined;
    }
}
