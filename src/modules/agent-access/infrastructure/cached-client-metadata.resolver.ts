import { ClientMetadata, ClientMetadataError, ClientMetadataResolver } from '../application/client-metadata';
import { isRegistrableRedirect } from '../application/redirect-uri';
import { MetadataFetcher } from './safe-metadata-fetcher';

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MIN_TTL_MS = 60 * 1000;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 30 * 1000;
const MAX_CACHE_ENTRIES = 1000;
const MAX_CONCURRENT_FETCHES = 16;
const MAX_CONCURRENT_FETCHES_PER_ORIGIN = 4;
const MAX_CLIENT_ID_LENGTH = 255;
const MAX_REDIRECT_URIS = 20;
const MAX_URI_LENGTH = 2048;
const MAX_CLIENT_NAME_LENGTH = 80;

type CacheEntry = { expiresAt: number; value: ClientMetadata | ClientMetadataError };

/**
 * Resolves OAuth Client ID Metadata Documents (draft-ietf-oauth-client-id-metadata-document, as used by the MCP
 * authorization spec): the client_id is an HTTPS URL whose document must name itself as client_id and list the
 * redirect URIs the client may use. Results are cached in-process, honouring Cache-Control within bounds;
 * failures are cached briefly so a bad client_id cannot make every authorize request hit the network.
 */
export class CachedClientMetadataResolver implements ClientMetadataResolver {
    private readonly cache = new Map<string, CacheEntry>();
    private readonly inflight = new Map<string, Promise<ClientMetadata>>();

    private readonly activeOrigins = new Map<string, number>();

    constructor(
        private readonly fetcher: MetadataFetcher,
        private readonly now: () => number = Date.now,
    ) {}

    async resolve(clientId: string): Promise<ClientMetadata> {
        const url = parseClientId(clientId);
        const cached = this.cache.get(clientId);
        if (cached && cached.expiresAt > this.now()) {
            if (cached.value instanceof ClientMetadataError) throw cached.value;
            return cached.value;
        }
        const pending = this.inflight.get(clientId);
        if (pending) return pending;
        const active = this.activeOrigins.get(url.origin) ?? 0;
        if (this.inflight.size >= MAX_CONCURRENT_FETCHES || active >= MAX_CONCURRENT_FETCHES_PER_ORIGIN) {
            // Reject without queuing/caching; overload must not trigger the pinned-client fallback.
            throw new ClientMetadataError('overloaded', 'Client metadata service is busy');
        }
        this.activeOrigins.set(url.origin, active + 1);
        const load = this.load(clientId, url).finally(() => {
            this.inflight.delete(clientId);
            const remaining = this.activeOrigins.get(url.origin)! - 1;
            if (remaining) this.activeOrigins.set(url.origin, remaining);
            else this.activeOrigins.delete(url.origin);
        });
        this.inflight.set(clientId, load);
        return load;
    }

    private async load(clientId: string, url: URL): Promise<ClientMetadata> {
        let body: string;
        let cacheControl: string | undefined;
        try {
            ({ body, cacheControl } = await this.fetcher.fetch(url));
        } catch {
            const error = new ClientMetadataError('unreachable', 'Client metadata document could not be fetched');
            this.store(clientId, error, FAILURE_TTL_MS);
            throw error;
        }
        try {
            const metadata = parseDocument(clientId, url, body);
            this.store(clientId, metadata, cacheLifetime(cacheControl));
            return metadata;
        } catch (error) {
            const failure =
                error instanceof ClientMetadataError
                    ? error
                    : new ClientMetadataError('invalid_document', 'Client metadata document is invalid');
            this.store(clientId, failure, FAILURE_TTL_MS);
            throw failure;
        }
    }

    private store(clientId: string, value: CacheEntry['value'], ttlMs: number) {
        this.cache.delete(clientId);
        if (ttlMs <= 0) return;
        if (this.cache.size >= MAX_CACHE_ENTRIES) this.cache.delete(this.cache.keys().next().value as string);
        this.cache.set(clientId, { value, expiresAt: this.now() + ttlMs });
    }
}

/** A client_id must be a canonical HTTPS URL with a path, no credentials, fragment, explicit port or dot segments. */
export function parseClientId(clientId: string): URL {
    const invalid = () => new ClientMetadataError('invalid_client_id', 'client_id must be an HTTPS metadata URL');
    if (clientId.length > MAX_CLIENT_ID_LENGTH) throw invalid();
    let url: URL;
    try {
        url = new URL(clientId);
    } catch {
        throw invalid();
    }
    // Requiring the canonical serialisation rejects dot segments, default ports, upper-case hosts and similar aliases.
    if (
        url.href !== clientId ||
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.hash ||
        url.port ||
        url.pathname === '/'
    )
        throw invalid();
    return url;
}

function parseDocument(clientId: string, url: URL, body: string): ClientMetadata {
    const invalid = (detail: string) =>
        new ClientMetadataError('invalid_document', `Client metadata document is invalid: ${detail}`);
    let document: unknown;
    try {
        document = JSON.parse(body);
    } catch {
        throw invalid('not JSON');
    }
    if (!document || typeof document !== 'object' || Array.isArray(document)) throw invalid('not an object');
    const doc = document as Record<string, unknown>;
    if (doc.client_id !== clientId) throw invalid('client_id does not match the document URL');
    if (!supportsPublicClientAuth(doc)) throw invalid('client must support token_endpoint_auth_method "none"');

    const redirectUris = Array.isArray(doc.redirect_uris)
        ? doc.redirect_uris
              .slice(0, MAX_REDIRECT_URIS)
              .filter(
                  (value): value is string =>
                      typeof value === 'string' && value.length <= MAX_URI_LENGTH && isRegistrableRedirect(value),
              )
        : [];
    if (!redirectUris.length) throw invalid('no usable redirect_uris');

    return {
        clientId,
        host: url.host,
        clientName: displayName(doc.client_name) ?? url.host,
        redirectUris,
        clientUri: httpsUri(doc.client_uri),
        logoUri: httpsUri(doc.logo_uri),
    };
}

/** This server only issues tokens to public clients (PKCE, no client authentication). */
function supportsPublicClientAuth(doc: Record<string, unknown>): boolean {
    if (Array.isArray(doc.token_endpoint_auth_methods_supported))
        return doc.token_endpoint_auth_methods_supported.includes('none');
    return doc.token_endpoint_auth_method === undefined || doc.token_endpoint_auth_method === 'none';
}

function displayName(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    // eslint-disable-next-line no-control-regex
    const name = value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '');
    const trimmed = name.replace(/\s+/g, ' ').trim().slice(0, MAX_CLIENT_NAME_LENGTH).trim();
    return trimmed || undefined;
}

function httpsUri(value: unknown): string | undefined {
    if (typeof value !== 'string' || value.length > MAX_URI_LENGTH) return undefined;
    try {
        const uri = new URL(value);
        return uri.protocol === 'https:' && !uri.username && !uri.password ? uri.href : undefined;
    } catch {
        return undefined;
    }
}

/** Honour Cache-Control max-age within [1 minute, 24 hours]; no-store/no-cache disables caching. */
export function cacheLifetime(cacheControl?: string): number {
    if (!cacheControl) return DEFAULT_TTL_MS;
    const directives = cacheControl.toLowerCase();
    if (/(^|[,\s])(no-store|no-cache)([,\s=]|$)/.test(directives)) return 0;
    const maxAge = /(?:^|[,\s])max-age\s*=\s*"?(\d+)"?/.exec(directives);
    if (!maxAge) return DEFAULT_TTL_MS;
    return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, Number(maxAge[1]) * 1000));
}
