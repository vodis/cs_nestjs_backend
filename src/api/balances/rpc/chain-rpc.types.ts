export type ChainRpcEndpoint = {
    alias: string;
    url: string;
};

export type ChainRpcResult<T> = {
    result: T;
    providerAlias: string;
};

export type ChainRpcBatchRequest = {
    key: string;
    method: string;
    params: unknown;
};

export type ChainRpcBatchItem = {
    key: string;
    result?: unknown;
    error?: string;
};

export type ChainRpcBatchResult = {
    items: ChainRpcBatchItem[];
    providerAlias: string;
};

export type JsonRpcEnvelope<T> = {
    jsonrpc?: string;
    id?: string | number;
    result?: T;
    error?: {
        code?: number;
        message?: string;
        data?: unknown;
    };
};

export class ChainRpcRequestError extends Error {
    constructor(
        message: string,
        readonly retryable: boolean,
    ) {
        super(message);
    }
}
