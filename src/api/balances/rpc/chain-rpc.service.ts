import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import { parseEvmRpcChainId, parseSupportedChainNetwork } from '../../../utils/chain-network.util';
import {
    ChainRpcBatchRequest,
    ChainRpcBatchResult,
    ChainRpcEndpoint,
    ChainRpcRequestError,
    ChainRpcResult,
    JsonRpcEnvelope,
} from './chain-rpc.types';

type EndpointState = {
    failures: number;
    openUntil: number;
    verified: boolean;
};

type NearStatus = { chain_id?: string };

const ALIAS_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

@Injectable()
export class ChainRpcService implements OnModuleInit {
    private readonly logger = new Logger(ChainRpcService.name);
    private readonly endpoints: Map<string, ChainRpcEndpoint[]>;
    private readonly states = new Map<string, EndpointState>();
    private requestId = 0;

    constructor(
        private readonly config: ConfigService,
        private readonly http: HttpService,
    ) {
        this.endpoints = this.loadEndpoints();
    }

    async onModuleInit(): Promise<void> {
        const configuredEndpoints = this.config.get<string>('CHAIN_RPC_ENDPOINTS_JSON')?.trim();
        if (this.isProduction() && !configuredEndpoints) {
            throw new Error('CHAIN_RPC_ENDPOINTS_JSON is required in production');
        }
        if (this.isProduction()) await this.verifyConfiguredNetworks();
    }

    async request<T>(network: string, method: string, params: unknown): Promise<ChainRpcResult<T>> {
        const endpoints = this.endpoints.get(network);
        if (!endpoints?.length) {
            throw new ServiceUnavailableException(`RPC network is not configured: ${network}`);
        }

        const deadline = Date.now() + this.positiveNumber('RPC_TOTAL_TIMEOUT_MS', 6000);
        let lastError: Error | undefined;

        for (const endpoint of endpoints) {
            const state = this.state(network, endpoint.alias);
            if (state.openUntil > Date.now()) continue;

            try {
                await this.verifyNetwork(network, endpoint, state, deadline);
                const result = await this.call<T>(endpoint, method, params, deadline);
                state.failures = 0;
                state.openUntil = 0;
                return { result, providerAlias: endpoint.alias };
            } catch (error) {
                const rpcError = this.toRpcError(error);
                lastError = rpcError;
                if (!rpcError.retryable) throw rpcError;
                this.recordFailure(network, endpoint.alias, state, method, rpcError);
            }
        }

        throw new ServiceUnavailableException(lastError?.message || `No healthy RPC endpoint for ${network}`);
    }

    async requestBatch(network: string, requests: ChainRpcBatchRequest[]): Promise<ChainRpcBatchResult> {
        if (!requests.length) return { items: [], providerAlias: 'none' };
        const endpoints = this.endpoints.get(network);
        if (!endpoints?.length) {
            throw new ServiceUnavailableException(`RPC network is not configured: ${network}`);
        }

        const deadline = Date.now() + this.positiveNumber('RPC_TOTAL_TIMEOUT_MS', 6000);
        let lastError: Error | undefined;
        for (const endpoint of endpoints) {
            const state = this.state(network, endpoint.alias);
            if (state.openUntil > Date.now()) continue;
            try {
                await this.verifyNetwork(network, endpoint, state, deadline);
                const items = await this.callBatch(endpoint, requests, deadline);
                state.failures = 0;
                state.openUntil = 0;
                return { items, providerAlias: endpoint.alias };
            } catch (error) {
                const rpcError = this.toRpcError(error);
                lastError = rpcError;
                if (!rpcError.retryable) throw rpcError;
                this.recordFailure(network, endpoint.alias, state, 'batch', rpcError);
            }
        }
        throw new ServiceUnavailableException(lastError?.message || `No healthy RPC endpoint for ${network}`);
    }

    private async verifyNetwork(
        network: string,
        endpoint: ChainRpcEndpoint,
        state: EndpointState,
        deadline: number,
    ): Promise<void> {
        if (state.verified) return;

        const parsedNetwork = parseSupportedChainNetwork(network);
        if (!parsedNetwork) {
            throw new ChainRpcRequestError(`RPC network is unsupported: ${network}`, false);
        }

        switch (parsedNetwork.namespace) {
            case 'near':
                await this.verifyNearNetwork(parsedNetwork.reference, endpoint, deadline);
                break;
            case 'eip155':
                await this.verifyEvmNetwork(parsedNetwork.chainId, endpoint, deadline);
                break;
            default:
                throw new ChainRpcRequestError(`RPC network is unsupported: ${network}`, false);
        }

        state.verified = true;
    }

    private async verifyConfiguredNetworks(): Promise<void> {
        for (const [network, endpoints] of this.endpoints) {
            let lastError: ChainRpcRequestError | undefined;
            for (const endpoint of endpoints) {
                const state = this.state(network, endpoint.alias);
                try {
                    const deadline = Date.now() + this.positiveNumber('RPC_TOTAL_TIMEOUT_MS', 6000);
                    await this.verifyNetwork(network, endpoint, state, deadline);
                    lastError = undefined;
                    break;
                } catch (error) {
                    lastError = this.toRpcError(error);
                    this.recordFailure(network, endpoint.alias, state, 'startup', lastError);
                }
            }
            if (lastError) {
                throw new Error(`RPC startup verification failed for ${network}: ${lastError.message}`);
            }
        }
    }

    private async verifyNearNetwork(
        expectedNetwork: string,
        endpoint: ChainRpcEndpoint,
        deadline: number,
    ): Promise<void> {
        const status = await this.call<NearStatus>(endpoint, 'status', [], deadline);
        if (status.chain_id !== expectedNetwork) {
            throw new ChainRpcRequestError(`RPC endpoint ${endpoint.alias} returned the wrong NEAR network`, true);
        }
    }

    private async verifyEvmNetwork(
        expectedChainId: bigint,
        endpoint: ChainRpcEndpoint,
        deadline: number,
    ): Promise<void> {
        const chainId = parseEvmRpcChainId(await this.call<unknown>(endpoint, 'eth_chainId', [], deadline));
        if (chainId !== expectedChainId) {
            throw new ChainRpcRequestError(`RPC endpoint ${endpoint.alias} returned the wrong EVM network`, true);
        }
    }

    private async call<T>(endpoint: ChainRpcEndpoint, method: string, params: unknown, deadline: number): Promise<T> {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new ChainRpcRequestError('RPC request deadline exceeded', true);

        const timeout = Math.min(this.positiveNumber('RPC_ATTEMPT_TIMEOUT_MS', 2500), remaining);
        const response = await this.http.axiosRef.post<JsonRpcEnvelope<T>>(
            endpoint.url,
            {
                jsonrpc: '2.0',
                id: String(++this.requestId),
                method,
                params,
            },
            { timeout },
        );
        const envelope = response.data;
        if (envelope?.error) {
            const message = envelope.error.message || 'RPC provider rejected the request';
            const retryable = this.isRetryableProviderError(envelope.error.code, message);
            throw new ChainRpcRequestError(
                retryable ? 'RPC provider is temporarily unavailable' : 'RPC provider rejected the request',
                retryable,
            );
        }
        if (!envelope || envelope.result === undefined) {
            throw new ChainRpcRequestError('RPC provider returned an invalid response', true);
        }
        return envelope.result;
    }

    private async callBatch(endpoint: ChainRpcEndpoint, requests: ChainRpcBatchRequest[], deadline: number) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new ChainRpcRequestError('RPC request deadline exceeded', true);
        const timeout = Math.min(this.positiveNumber('RPC_ATTEMPT_TIMEOUT_MS', 2500), remaining);
        const keyedRequests = requests.map((request) => ({ ...request, id: String(++this.requestId) }));
        const response = await this.http.axiosRef.post<JsonRpcEnvelope<unknown>[]>(
            endpoint.url,
            keyedRequests.map(({ id, method, params }) => ({ jsonrpc: '2.0', id, method, params })),
            { timeout },
        );
        if (!Array.isArray(response.data)) throw new ChainRpcRequestError('RPC provider rejected batch requests', true);

        const envelopeById = new Map(response.data.map((envelope) => [String(envelope.id), envelope]));
        return keyedRequests.map(({ key, id }) => {
            const envelope = envelopeById.get(id);
            if (!envelope) throw new ChainRpcRequestError('RPC provider returned an incomplete batch', true);
            if (envelope.error) {
                const message = envelope.error.message || 'RPC provider rejected a batch item';
                if (this.isRetryableProviderError(envelope.error.code, message)) {
                    throw new ChainRpcRequestError('RPC provider is temporarily unavailable', true);
                }
                return { key, error: 'RPC provider rejected the batch item' };
            }
            if (envelope.result === undefined) {
                throw new ChainRpcRequestError('RPC provider returned an invalid batch item', true);
            }
            return { key, result: envelope.result };
        });
    }

    private loadEndpoints(): Map<string, ChainRpcEndpoint[]> {
        const raw = this.config.get<string>('CHAIN_RPC_ENDPOINTS_JSON')?.trim();
        if (!raw) return this.legacyEndpoints();

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            throw new Error('CHAIN_RPC_ENDPOINTS_JSON must be valid JSON');
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('CHAIN_RPC_ENDPOINTS_JSON must be an object keyed by CAIP-2 network');
        }

        const result = new Map<string, ChainRpcEndpoint[]>();
        for (const [network, value] of Object.entries(parsed)) {
            if (
                !parseSupportedChainNetwork(network) ||
                !Array.isArray(value) ||
                value.length === 0 ||
                value.length > 4
            ) {
                throw new Error(`Invalid RPC endpoint list for ${network}`);
            }
            const endpoints = value.map((candidate) => this.parseEndpoint(network, candidate));
            if (new Set(endpoints.map((endpoint) => endpoint.alias)).size !== endpoints.length) {
                throw new Error(`RPC endpoint aliases must be unique for ${network}`);
            }
            result.set(network, endpoints);
        }
        if (result.size === 0) throw new Error('CHAIN_RPC_ENDPOINTS_JSON must configure at least one network');
        return result;
    }

    private parseEndpoint(network: string, candidate: unknown): ChainRpcEndpoint {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
            throw new Error(`Invalid RPC endpoint for ${network}`);
        }
        const alias = Reflect.get(candidate, 'alias');
        const url = Reflect.get(candidate, 'url');
        if (typeof alias !== 'string' || !ALIAS_PATTERN.test(alias) || typeof url !== 'string') {
            throw new Error(`Invalid RPC endpoint for ${network}`);
        }
        this.validateUrl(url);
        return { alias, url };
    }

    private validateUrl(value: string): void {
        let url: URL;
        try {
            url = new URL(value);
        } catch {
            throw new Error('RPC endpoint URL is invalid');
        }
        const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
        if (url.protocol !== 'https:' && !(localHttp && !this.isProduction())) {
            throw new Error('RPC endpoint URLs must use HTTPS outside local development');
        }
        if (url.username || url.password) throw new Error('RPC endpoint URLs must not use basic authentication');
    }

    private legacyEndpoints(): Map<string, ChainRpcEndpoint[]> {
        const result = new Map<string, ChainRpcEndpoint[]>();
        const nearMainnet = this.config.get<string>('NEAR_RPC_URL')?.trim() || 'https://rpc.mainnet.near.org';
        this.validateUrl(nearMainnet);
        result.set('near:mainnet', [{ alias: 'near-default', url: nearMainnet }]);

        const optional = [
            ['near:testnet', 'NEAR_TESTNET_RPC_URL'],
            ['eip155:1', 'ETHEREUM_MAINNET_RPC_URL'],
            ['eip155:8453', 'BASE_MAINNET_RPC_URL'],
        ] as const;
        for (const [network, key] of optional) {
            const url = this.config.get<string>(key)?.trim();
            if (!url) continue;
            this.validateUrl(url);
            result.set(network, [{ alias: `${network.replace(/[^a-z0-9]+/g, '-')}-default`, url }]);
        }
        return result;
    }

    private state(network: string, alias: string): EndpointState {
        const key = `${network}|${alias}`;
        let state = this.states.get(key);
        if (!state) {
            state = { failures: 0, openUntil: 0, verified: false };
            this.states.set(key, state);
        }
        return state;
    }

    private recordFailure(network: string, alias: string, state: EndpointState, method: string, error: Error): void {
        state.failures += 1;
        state.verified = false;
        if (state.failures >= this.positiveNumber('RPC_FAILURE_THRESHOLD', 3)) {
            state.openUntil = Date.now() + this.positiveNumber('RPC_COOLDOWN_MS', 30000);
        }
        this.logger.warn(
            `RPC attempt failed network=${network} provider=${alias} method=${method} failures=${state.failures} reason=${error.message}`,
        );
    }

    private toRpcError(error: unknown): ChainRpcRequestError {
        if (error instanceof ChainRpcRequestError) return error;
        if (isAxiosError(error)) {
            const retryable =
                !error.response ||
                error.code === 'ECONNABORTED' ||
                error.response.status === 429 ||
                error.response.status >= 500;
            return new ChainRpcRequestError(
                retryable ? 'RPC provider is temporarily unavailable' : 'RPC provider rejected the request',
                retryable,
            );
        }
        return new ChainRpcRequestError('RPC provider request failed', true);
    }

    private isRetryableProviderError(code: number | undefined, message: string): boolean {
        return code === -32005 || /rate.?limit|too many requests|temporar|timeout|unavailable/i.test(message);
    }

    private positiveNumber(name: string, fallback: number): number {
        const value = Number(this.config.get(name));
        return Number.isFinite(value) && value > 0 ? value : fallback;
    }

    private isProduction(): boolean {
        return this.config.get<string>('NODE_ENV') === 'production';
    }
}
