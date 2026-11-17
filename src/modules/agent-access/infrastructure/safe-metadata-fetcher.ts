import { lookup as dnsLookup } from 'dns';
import type { IncomingMessage } from 'http';
import * as https from 'https';
import { BlockList, isIP, LookupFunction } from 'net';

export type MetadataResponse = { body: string; cacheControl?: string };

export interface MetadataFetcher {
    fetch(url: URL): Promise<MetadataResponse>;
}

export class MetadataFetchError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MetadataFetchError';
    }
}

type ResolvedAddress = { address: string; family: number };
type Resolve = (hostname: string) => Promise<ResolvedAddress[]>;
type RequestFn = (
    options: https.RequestOptions,
    callback: (response: IncomingMessage) => void,
) => ReturnType<typeof https.request>;

export type SafeMetadataFetcherOptions = {
    timeoutMs?: number;
    maxBytes?: number;
    /** Test seams; production uses system DNS, HTTPS on port 443 and the public-address policy. */
    resolve?: Resolve;
    request?: RequestFn;
    port?: number;
    isAllowedAddress?: (address: string) => boolean;
};

const IPV4_BLOCKED = new BlockList();
for (const [network, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
] as const) {
    IPV4_BLOCKED.addSubnet(network, prefix, 'ipv4');
}

// Kept separate from the IPv4 list: Node's BlockList matches IPv4 queries against IPv4-mapped IPv6 rules.
const IPV6_BLOCKED = new BlockList();
for (const [network, prefix] of [
    ['::', 128],
    ['::1', 128],
    ['::ffff:0:0', 96], // IPv4-mapped
    ['64:ff9b::', 96], // NAT64
    ['64:ff9b:1::', 48], // local-use NAT64
    ['100::', 64], // discard-only
    ['2001::', 23], // IETF protocol assignments incl. Teredo
    ['2001:db8::', 32], // documentation
    ['2002::', 16], // 6to4 can embed private IPv4
    ['fc00::', 7], // unique local, incl. cloud metadata such as fd00:ec2::254
    ['fe80::', 10], // link-local
    ['fec0::', 10], // site-local (deprecated)
    ['ff00::', 8], // multicast
] as const) {
    IPV6_BLOCKED.addSubnet(network, prefix, 'ipv6');
}

/** True only for globally routable unicast addresses; private, loopback, link-local and metadata ranges are refused. */
export function isPublicAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) return !IPV4_BLOCKED.check(address, 'ipv4');
    if (family === 6) return !IPV6_BLOCKED.check(address, 'ipv6');
    return false;
}

const systemResolve: Resolve = (hostname) =>
    new Promise((resolve, reject) =>
        dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) =>
            error ? reject(error) : resolve(addresses),
        ),
    );

/**
 * Fetches client metadata documents without letting a client_id point the server at internal infrastructure:
 * HTTPS on the default port only, every resolved address must be public (checked inside the socket lookup, so the
 * vetted address is the one connected to), no redirects, a hard deadline and a response size cap.
 */
export class SafeMetadataFetcher implements MetadataFetcher {
    private readonly timeoutMs: number;
    private readonly maxBytes: number;
    private readonly resolve: Resolve;
    private readonly request: RequestFn;
    private readonly port: number;
    private readonly isAllowedAddress: (address: string) => boolean;

    constructor(options: SafeMetadataFetcherOptions = {}) {
        this.timeoutMs = options.timeoutMs ?? 3000;
        this.maxBytes = options.maxBytes ?? 5 * 1024;
        this.resolve = options.resolve ?? systemResolve;
        this.request = options.request ?? https.request;
        this.port = options.port ?? 443;
        this.isAllowedAddress = options.isAllowedAddress ?? isPublicAddress;
    }

    fetch(url: URL): Promise<MetadataResponse> {
        if (url.protocol !== 'https:') return Promise.reject(new MetadataFetchError('Client metadata must use HTTPS'));
        const hostname = url.hostname.replace(/^\[(.*)\]$/, '$1');
        // Node connects to IP literals without calling `lookup`, so they are vetted here.
        if (isIP(hostname) && !this.isAllowedAddress(hostname))
            return Promise.reject(new MetadataFetchError('Client metadata host is not publicly routable'));

        return new Promise<MetadataResponse>((resolve, reject) => {
            // Assigned below; `finish` only runs asynchronously, after both exist.
            const pending: { request?: ReturnType<RequestFn>; deadline?: NodeJS.Timeout; settled?: boolean } = {};
            const finish = (error: Error | null, value?: MetadataResponse) => {
                if (pending.settled) return;
                pending.settled = true;
                clearTimeout(pending.deadline);
                if (error) {
                    pending.request?.destroy();
                    reject(error);
                } else resolve(value as MetadataResponse);
            };
            const request = this.request(
                {
                    hostname,
                    port: this.port,
                    path: `${url.pathname}${url.search}`,
                    method: 'GET',
                    agent: false,
                    lookup: this.lookup(),
                    headers: { accept: 'application/json', 'user-agent': 'CraftScript-OAuth/1.0' },
                },
                (response) => {
                    if (response.statusCode !== 200) {
                        response.resume();
                        return finish(new MetadataFetchError(`Client metadata returned HTTP ${response.statusCode}`));
                    }
                    const declared = Number(response.headers['content-length']);
                    if (Number.isFinite(declared) && declared > this.maxBytes)
                        return finish(new MetadataFetchError('Client metadata document is too large'));
                    const chunks: Buffer[] = [];
                    let size = 0;
                    response.on('data', (chunk: Buffer) => {
                        size += chunk.length;
                        if (size > this.maxBytes)
                            return finish(new MetadataFetchError('Client metadata document is too large'));
                        chunks.push(chunk);
                    });
                    response.on('end', () =>
                        finish(null, {
                            body: Buffer.concat(chunks).toString('utf8'),
                            cacheControl: response.headers['cache-control'],
                        }),
                    );
                    response.on('error', (error) => finish(error));
                },
            );
            pending.request = request;
            pending.deadline = setTimeout(
                () => finish(new MetadataFetchError('Client metadata request timed out')),
                this.timeoutMs,
            );
            request.on('error', (error) => finish(error));
            request.end();
        });
    }

    private lookup(): LookupFunction {
        const lookup = (
            hostname: string,
            options: { all?: boolean },
            callback: (error: Error | null, address?: unknown, family?: number) => void,
        ) => {
            this.resolve(hostname).then(
                (addresses) => {
                    if (!addresses.length || addresses.some((entry) => !this.isAllowedAddress(entry.address)))
                        return callback(new MetadataFetchError('Client metadata host is not publicly routable'));
                    if (options?.all) return callback(null, addresses);
                    callback(null, addresses[0].address, addresses[0].family);
                },
                (error: Error) => callback(error),
            );
        };
        return lookup as unknown as LookupFunction;
    }
}
