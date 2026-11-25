import { providerPools } from '../rpc/provider-config';
import { Address } from '@ton/core';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';

type TonCenterEnvelope<T> = { ok?: boolean; result?: T };
type JettonWallet = { address?: string; balance?: unknown; jetton?: unknown; owner?: unknown };
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
        if (!Array.isArray(wallets)) throw new ServiceUnavailableException('Invalid Jetton wallets response');
        if (wallets.length === 0) return '0';
        return this.unsignedAmount(wallets[0].balance, 'Jetton');
    }

    async getJettonWalletAddress(network: string, owner: string, jetton: string): Promise<string> {
        const response = await this.get<JettonWalletsResponse>(
            network,
            '/api/v3/jetton/wallets',
            { owner_address: owner, jetton_address: jetton, limit: 1 },
            this.toncenterBaseUrl(network),
        );
        const wallet = response.data.jetton_wallets?.[0];
        const address = wallet?.address;
        if (!address) throw new BadRequestException('No funded jetton wallet for this token');
        if (
            typeof wallet?.owner !== 'string' ||
            typeof wallet.jetton !== 'string' ||
            !Address.parse(wallet.owner).equals(Address.parse(owner)) ||
            !Address.parse(wallet.jetton).equals(Address.parse(jetton))
        )
            throw new ServiceUnavailableException('TON provider returned a different jetton wallet');
        return Address.parse(address).toRawString();
    }

    async getWalletPublicKey(address: string): Promise<Buffer> {
        // Only the trusted mainnet endpoint supplies the key used to verify wallet ownership.
        const baseUrl = TONCENTER_BASE_URL['ton:mainnet'];
        const key = this.apiKey('ton:mainnet', baseUrl);
        const response = await this.http.axiosRef.post<TonCenterEnvelope<{ exit_code?: number; stack?: unknown[][] }>>(
            `${baseUrl}/api/v2/runGetMethod`,
            { address, method: 'get_public_key', stack: [] },
            { headers: key ? { 'X-API-Key': key } : undefined, timeout: this.timeoutMs(), maxRedirects: 0 },
        );
        const result = response.data.result;
        const value = result?.stack?.[0]?.[1];
        if (
            response.data.ok !== true ||
            result?.exit_code !== 0 ||
            typeof value !== 'string' ||
            !/^0x[0-9a-f]{1,64}$/i.test(value)
        )
            throw new ServiceUnavailableException('Unable to verify TON wallet public key');
        return Buffer.from(value.slice(2).padStart(64, '0'), 'hex');
    }

    private async get<T>(
        network: string,
        path: string,
        params: Record<string, string | number>,
        baseUrl = this.balanceBaseUrl(network),
    ) {
        const apiKey = this.apiKey(network, baseUrl);
        try {
            return await this.http.axiosRef.get<T>(`${baseUrl}${path}`, {
                params,
                headers: apiKey ? { 'X-API-Key': apiKey } : undefined,
                timeout: this.timeoutMs(),
                maxRedirects: 0,
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

    private balanceBaseUrl(network: string): string {
        const original = this.toncenterBaseUrl(network);
        return providerPools(this.config)?.get(network)?.[0].url ?? original;
    }

    private toncenterBaseUrl(network: string): string {
        if (!Object.prototype.hasOwnProperty.call(TONCENTER_BASE_URL, network))
            throw new ServiceUnavailableException('TON network is not configured');
        return TONCENTER_BASE_URL[network];
    }

    private apiKey(network: string, baseUrl: string): string | undefined {
        // Legacy credentials belong only to the original Toncenter origin.
        if (new URL(baseUrl).origin !== TONCENTER_BASE_URL[network]) return undefined;
        const key = network === 'ton:testnet' ? 'TONCENTER_TESTNET_API_KEY' : 'TONCENTER_API_KEY';
        return this.config.get<string>(key)?.trim() || undefined;
    }

    private timeoutMs(): number {
        const value = Number(this.config.get('TONCENTER_TIMEOUT_MS'));
        return Number.isFinite(value) && value > 0 ? value : 4000;
    }
}
