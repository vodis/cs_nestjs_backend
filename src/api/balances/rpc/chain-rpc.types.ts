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
    errorCode?: 'near_account_missing';
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
        name?: string;
        cause?: { name?: string; info?: { requested_account_id?: string } };
    };
};

export class ChainRpcRequestError extends Error {
    constructor(
        message: string,
        readonly retryable: boolean,
        readonly errorCode?: ChainRpcBatchItem['errorCode'],
    ) {
        super(message);
    }
}
