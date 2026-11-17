import { ClientMetadataError } from '../application/client-metadata';
import { CachedClientMetadataResolver, cacheLifetime, parseClientId } from './cached-client-metadata.resolver';
import { MetadataFetchError } from './safe-metadata-fetcher';

const CLIENT_ID = 'https://cli.example/oauth/client.json';

function document(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
        client_id: CLIENT_ID,
        client_name: 'Example CLI',
        redirect_uris: ['http://127.0.0.1/callback', 'https://cli.example/callback'],
        token_endpoint_auth_method: 'none',
        client_uri: 'https://cli.example/',
        logo_uri: 'https://cli.example/logo.png',
        ...overrides,
    });
}

describe('CachedClientMetadataResolver', () => {
    let now: number;
    let fetch: jest.Mock;
    let resolver: CachedClientMetadataResolver;

    beforeEach(() => {
        now = 1_000_000;
        fetch = jest.fn(async () => ({ body: document(), cacheControl: 'max-age=600' }));
        resolver = new CachedClientMetadataResolver({ fetch }, () => now);
    });

    it('returns validated client metadata', async () => {
        await expect(resolver.resolve(CLIENT_ID)).resolves.toEqual({
            clientId: CLIENT_ID,
            host: 'cli.example',
            clientName: 'Example CLI',
            redirectUris: ['http://127.0.0.1/callback', 'https://cli.example/callback'],
            clientUri: 'https://cli.example/',
            logoUri: 'https://cli.example/logo.png',
        });
        expect(fetch).toHaveBeenCalledWith(new URL(CLIENT_ID));
    });

    it('caches for the advertised max-age and refetches afterwards', async () => {
        await resolver.resolve(CLIENT_ID);
        now += 599_000;
        await resolver.resolve(CLIENT_ID);
        expect(fetch).toHaveBeenCalledTimes(1);
        now += 2_000;
        await resolver.resolve(CLIENT_ID);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('shares one fetch between concurrent requests', async () => {
        await Promise.all([resolver.resolve(CLIENT_ID), resolver.resolve(CLIENT_ID), resolver.resolve(CLIENT_ID)]);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('does not cache no-store documents', async () => {
        fetch.mockResolvedValue({ body: document(), cacheControl: 'no-store' });
        await resolver.resolve(CLIENT_ID);
        await resolver.resolve(CLIENT_ID);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('rejects a document that names a different client_id', async () => {
        fetch.mockResolvedValue({ body: document({ client_id: 'https://other.example/client.json' }) });
        await expect(resolver.resolve(CLIENT_ID)).rejects.toMatchObject({
            reason: 'invalid_document',
            message: expect.stringContaining('client_id does not match'),
        });
    });

    it.each([
        ['not JSON', '<html>'],
        ['an array', '[]'],
        ['without redirect URIs', document({ redirect_uris: [] })],
        [
            'with only unsafe redirect URIs',
            document({ redirect_uris: ['http://cli.example/cb', 'javascript:alert(1)'] }),
        ],
        ['requiring a client secret', document({ token_endpoint_auth_method: 'client_secret_basic' })],
        [
            'whose supported auth methods exclude none',
            document({ token_endpoint_auth_methods_supported: ['private_key_jwt'] }),
        ],
    ])('rejects a document %s', async (_label, body) => {
        fetch.mockResolvedValue({ body });
        await expect(resolver.resolve(CLIENT_ID)).rejects.toMatchObject({ reason: 'invalid_document' });
    });

    it('accepts ChatGPT-style documents that list none among supported auth methods', async () => {
        fetch.mockResolvedValue({
            body: document({
                token_endpoint_auth_method: 'private_key_jwt',
                token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
            }),
        });
        await expect(resolver.resolve(CLIENT_ID)).resolves.toMatchObject({ clientName: 'Example CLI' });
    });

    it('drops unsafe redirect, client and logo URIs and sanitises the display name', async () => {
        fetch.mockResolvedValue({
            body: document({
                client_name: '  Evil\u202e CLI\n\u0007  ',
                redirect_uris: ['http://evil.example/cb', 'http://[::1]/cb'],
                client_uri: 'javascript:alert(1)',
                logo_uri: 'http://cli.example/logo.png',
            }),
        });
        await expect(resolver.resolve(CLIENT_ID)).resolves.toMatchObject({
            clientName: 'Evil CLI',
            redirectUris: ['http://[::1]/cb'],
            clientUri: undefined,
            logoUri: undefined,
        });
    });

    it('falls back to the host when the document has no usable name', async () => {
        fetch.mockResolvedValue({ body: document({ client_name: '   ' }) });
        await expect(resolver.resolve(CLIENT_ID)).resolves.toMatchObject({ clientName: 'cli.example' });
    });

    it('reports fetch failures generically and caches them briefly', async () => {
        fetch.mockRejectedValue(new MetadataFetchError('Client metadata host is not publicly routable'));
        const failure = await resolver.resolve(CLIENT_ID).catch((error) => error);
        expect(failure).toBeInstanceOf(ClientMetadataError);
        expect(failure).toMatchObject({
            reason: 'unreachable',
            message: 'Client metadata document could not be fetched',
        });
        await expect(resolver.resolve(CLIENT_ID)).rejects.toMatchObject({ reason: 'unreachable' });
        expect(fetch).toHaveBeenCalledTimes(1);
        now += 31_000;
        fetch.mockResolvedValue({ body: document() });
        await expect(resolver.resolve(CLIENT_ID)).resolves.toMatchObject({ host: 'cli.example' });
    });

    it.each(['success', 'fetch failure', 'invalid document'])(
        'PR #283: bounds per-origin work and releases slots after %s',
        async (outcome) => {
            const releases: (() => void)[] = [];
            fetch.mockImplementation(
                (url: URL) =>
                    new Promise((resolve, reject) => {
                        releases.push(() => {
                            if (outcome === 'fetch failure') reject(new Error('offline'));
                            else
                                resolve({
                                    body: outcome === 'invalid document' ? '{}' : document({ client_id: url.href }),
                                });
                        });
                    }),
            );
            const ids = Array.from({ length: 4 }, (_, i) => `${CLIENT_ID}?id=${i}`);
            const pending = ids.map((id) => resolver.resolve(id));
            const settled = Promise.allSettled(pending);
            const duplicate = resolver.resolve(ids[0]);
            const duplicateSettled = Promise.allSettled([duplicate]);
            await expect(resolver.resolve(`${CLIENT_ID}?id=overflow`)).rejects.toMatchObject({ reason: 'overloaded' });
            expect(fetch).toHaveBeenCalledTimes(4);
            releases.forEach((release) => release());
            await settled;
            await duplicateSettled;
            fetch.mockImplementation(async (url: URL) => ({ body: document({ client_id: url.href }) }));
            await expect(resolver.resolve(`${CLIENT_ID}?id=overflow`)).resolves.toMatchObject({ host: 'cli.example' });
        },
    );

    it('PR #283: caps a burst of distinct origins without queuing and still serves cached clients', async () => {
        await resolver.resolve(CLIENT_ID);
        const releases: (() => void)[] = [];
        fetch.mockImplementation(
            (url: URL) =>
                new Promise((resolve) => {
                    releases.push(() => resolve({ body: document({ client_id: url.href }) }));
                }),
        );
        const requests = Array.from({ length: 1500 }, (_, i) =>
            resolver.resolve(`https://client${i}.example/client.json`),
        );
        const settled = Promise.allSettled(requests);
        expect(fetch).toHaveBeenCalledTimes(17); // One cached document plus sixteen active fetches.
        await expect(resolver.resolve(CLIENT_ID)).resolves.toMatchObject({ host: 'cli.example' });
        releases.forEach((release) => release());
        const results = await settled;
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(16);
        expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1484);
        fetch.mockImplementation(async (url: URL) => ({ body: document({ client_id: url.href }) }));
        await expect(resolver.resolve('https://recovered.example/client.json')).resolves.toMatchObject({
            host: 'recovered.example',
        });
    });

    it('rejects malformed client_ids without fetching', async () => {
        await expect(resolver.resolve('http://cli.example/client.json')).rejects.toMatchObject({
            reason: 'invalid_client_id',
        });
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe('parseClientId', () => {
    it.each([
        'http://cli.example/client.json',
        'https://cli.example',
        'https://cli.example/',
        'https://user:pass@cli.example/client.json',
        'https://cli.example/client.json#frag',
        'https://cli.example:8443/client.json',
        'https://cli.example:443/client.json',
        'https://cli.example/a/../client.json',
        'https://cli.example/./client.json',
        'https://CLI.example/client.json',
        `https://cli.example/${'a'.repeat(260)}`,
        'not a url',
    ])('rejects %s', (clientId) => {
        expect(() => parseClientId(clientId)).toThrow(ClientMetadataError);
    });

    it('accepts a canonical https URL with a path', () => {
        expect(parseClientId('https://chatgpt.com/oauth/client.json').host).toBe('chatgpt.com');
    });
});

describe('cacheLifetime', () => {
    it.each([
        [undefined, 300_000],
        ['public, max-age=300', 300_000],
        ['max-age=1', 60_000],
        ['max-age=999999999', 86_400_000],
        ['no-store', 0],
        ['no-cache, max-age=600', 0],
        ['private', 300_000],
    ])('%s -> %d ms', (header, expected) => {
        expect(cacheLifetime(header)).toBe(expected);
    });
});
