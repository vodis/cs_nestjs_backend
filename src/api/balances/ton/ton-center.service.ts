import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';

type TonCenterEnvelope<T> = { ok?: boolean; result?: T };
type JettonWallet = { balance?: unknown; jetton?: unknown; owner?: unknown };
type JettonWalletsResponse = { jetton_wallets?: JettonWallet[] };

const TONCENTER_BASE_URL: Readonly<Record<string, string>> = {
    'ton:mainnet': 'https://toncenter.com',
    'ton:testnet': 'https://testnet.toncenter.com',
};

@Injectable()
export class TonCenterService {
    constructor(
        private readonly http: HttpService,
        private readonly config: ConfigService,
    ) {}

    async getNativeBalance(network: string, address: string): Promise<string> {
        const response = await this.get<TonCenterEnvelope<unknown>>(network, '/api/v2/getAddressBalance', {
            address,
        });
        return this.unsignedAmount(response.data?.ok === true ? response.data.result : undefined, 'native');
    }

    async getJettonBalance(network: string, ownerAddress: string, jettonAddress: string): Promise<string> {
        const response = await this.get<JettonWalletsResponse>(network, '/api/v3/jetton/wallets', {
            owner_address: ownerAddress,
            jetton_address: jettonAddress,
            limit: 1,
        });
        const wallets = response.data?.jetton_wallets;
        if (!Array.isArray(wallets) || wallets.length === 0) return '0';
        return this.unsignedAmount(wallets[0].balance, 'Jetton');
    }

    private async get<T>(network: string, path: string, params: Record<string, string | number>) {
        const baseUrl = TONCENTER_BASE_URL[network];
        if (!baseUrl) throw new ServiceUnavailableException(`TON network is not configured: ${network}`);
        const apiKey = this.apiKey(network);
        try {
            return await this.http.axiosRef.get<T>(`${baseUrl}${path}`, {
                params,
                headers: apiKey ? { 'X-API-Key': apiKey } : undefined,
                timeout: this.timeoutMs(),
            });
        } catch (error) {
            if (isAxiosError(error)) {
                if (error.response?.status === 400 || error.response?.status === 422) {
                    throw new BadRequestException('TON provider rejected the address or token');
                }
                if (error.response?.status === 429) {
                    throw new ServiceUnavailableException('TON provider rate limit exceeded');
                }
            }
            throw new ServiceUnavailableException('TON provider request failed');
        }
    }

    private unsignedAmount(value: unknown, kind: string): string {
        if (typeof value !== 'string' || !/^\d+$/.test(value)) {
            throw new ServiceUnavailableException(`TON provider returned an invalid ${kind} balance`);
        }
        return value;
    }

    private apiKey(network: string): string | undefined {
        const key = network === 'ton:testnet' ? 'TONCENTER_TESTNET_API_KEY' : 'TONCENTER_API_KEY';
        return this.config.get<string>(key)?.trim() || undefined;
    }

    private timeoutMs(): number {
        const value = Number(this.config.get('TONCENTER_TIMEOUT_MS'));
        return Number.isFinite(value) && value > 0 ? value : 4000;
    }
}
