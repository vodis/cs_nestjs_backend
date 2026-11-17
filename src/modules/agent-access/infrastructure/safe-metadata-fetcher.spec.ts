import { AddressInfo } from 'net';
import * as http from 'http';
import { isPublicAddress, MetadataFetchError, SafeMetadataFetcher } from './safe-metadata-fetcher';

describe('isPublicAddress', () => {
    it.each([
        '127.0.0.1',
        '10.1.2.3',
        '172.16.0.1',
        '172.31.255.255',
        '192.168.1.1',
        '169.254.169.254',
        '100.64.0.1',
        '0.0.0.0',
        '224.0.0.1',
        '::1',
        '::',
        'fe80::1',
        'fd00:ec2::254',
        '::ffff:10.0.0.1',
        '::ffff:7f00:1',
        '64:ff9b::a00:1',
        '2002:a00:1::1',
        'not-an-ip',
    ])('refuses %s', (address) => {
        expect(isPublicAddress(address)).toBe(false);
    });

    it.each(['8.8.8.8', '104.18.32.47', '172.32.0.1', '2606:4700::1111', '2a00:1450:4001::200e'])(
        'allows %s',
        (address) => {
            expect(isPublicAddress(address)).toBe(true);
        },
    );
});

describe('SafeMetadataFetcher', () => {
    let server: http.Server;
    let port: number;
    let hits: number;
    let handler: (request: http.IncomingMessage, response: http.ServerResponse) => void;

    beforeEach(async () => {
        hits = 0;
        handler = (_request, response) => {
            response.setHeader('content-type', 'application/json');
            response.setHeader('cache-control', 'public, max-age=300');
            response.end('{"ok":true}');
        };
        server = http.createServer((request, response) => {
            hits += 1;
            handler(request, response);
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        port = (server.address() as AddressInfo).port;
    });

    afterEach(async () => {
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
    });

    /** Talks plain HTTP to the local test server while keeping the production address checks in place. */
    function fetcher(addresses: string[], options: { allowLoopbackForTest?: boolean; timeoutMs?: number } = {}) {
        return new SafeMetadataFetcher({
            resolve: async () => addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
            request: http.request as never,
            port,
            timeoutMs: options.timeoutMs ?? 1000,
            isAllowedAddress: options.allowLoopbackForTest
                ? (address) => address === '127.0.0.1' || isPublicAddress(address)
                : isPublicAddress,
        });
    }

    const url = new URL('https://client.example/oauth/client.json');

    it('returns the body and cache-control of a public document', async () => {
        await expect(fetcher(['127.0.0.1'], { allowLoopbackForTest: true }).fetch(url)).resolves.toEqual({
            body: '{"ok":true}',
            cacheControl: 'public, max-age=300',
        });
        expect(hits).toBe(1);
    });

    it('never connects when DNS resolves to a private address', async () => {
        await expect(fetcher(['10.0.0.5']).fetch(url)).rejects.toThrow('not publicly routable');
        await expect(fetcher(['127.0.0.1']).fetch(url)).rejects.toThrow('not publicly routable');
        expect(hits).toBe(0);
    });

    it('refuses mixed answers that include any private address (DNS rebinding)', async () => {
        await expect(fetcher(['8.8.8.8', '169.254.169.254']).fetch(url)).rejects.toThrow('not publicly routable');
        expect(hits).toBe(0);
    });

    it('refuses private IP-literal hosts without resolving them', async () => {
        const request = jest.fn();
        const literal = new SafeMetadataFetcher({ request: request as never });
        await expect(literal.fetch(new URL('https://169.254.169.254/latest/meta-data'))).rejects.toBeInstanceOf(
            MetadataFetchError,
        );
        await expect(literal.fetch(new URL('https://[::1]/client.json'))).rejects.toBeInstanceOf(MetadataFetchError);
        expect(request).not.toHaveBeenCalled();
    });

    it('refuses non-https URLs', async () => {
        await expect(new SafeMetadataFetcher().fetch(new URL('http://client.example/c.json'))).rejects.toThrow('HTTPS');
    });

    it('does not follow redirects', async () => {
        handler = (_request, response) => {
            response.statusCode = 302;
            response.setHeader('location', 'http://169.254.169.254/latest/meta-data');
            response.end();
        };
        await expect(fetcher(['127.0.0.1'], { allowLoopbackForTest: true }).fetch(url)).rejects.toThrow('HTTP 302');
        expect(hits).toBe(1);
    });

    it('rejects documents above the size cap whether or not content-length is declared', async () => {
        handler = (_request, response) => response.end('x'.repeat(6 * 1024));
        await expect(fetcher(['127.0.0.1'], { allowLoopbackForTest: true }).fetch(url)).rejects.toThrow('too large');

        handler = (_request, response) => {
            response.write('x'.repeat(4 * 1024));
            response.end('x'.repeat(4 * 1024));
        };
        await expect(fetcher(['127.0.0.1'], { allowLoopbackForTest: true }).fetch(url)).rejects.toThrow('too large');
    });

    it('gives up after the deadline', async () => {
        handler = () => undefined;
        await expect(fetcher(['127.0.0.1'], { allowLoopbackForTest: true, timeoutMs: 100 }).fetch(url)).rejects.toThrow(
            'timed out',
        );
    });
});
