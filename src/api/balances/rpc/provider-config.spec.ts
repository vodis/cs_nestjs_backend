import { ConfigService } from '@nestjs/config';
import { BITCOIN_MAINNET } from '@vodis/cs-assets';
import { providerPools } from './provider-config';

const endpoint = { alias: 'primary', url: 'https://provider.example/' };
const parse = (value: unknown) =>
    providerPools(new ConfigService({ NODE_ENV: 'production', CHAIN_RPC_ENDPOINTS_JSON: JSON.stringify(value) }));

it('accepts mixed adapter families and normalizes REST roots without altering RPC URLs', () => {
    const pools = parse({
        'eip155:56': [endpoint],
        'oneclick:stellar': [endpoint],
        [BITCOIN_MAINNET]: [endpoint],
        'ton:mainnet': [endpoint],
    });
    expect(pools?.get('eip155:56')?.[0].url).toBe(endpoint.url);
    expect(pools?.get('oneclick:stellar')?.[0].url).toBe('https://provider.example');
});
it.each([
    null,
    [],
    {},
    { 'oneclick:unknown': [endpoint] },
    { stellar: [endpoint] },
    { 'oneclick:stellar': [] },
    { 'oneclick:stellar': [endpoint, endpoint] },
    { 'ton:mainnet': [endpoint, { ...endpoint, alias: 'backup' }] },
    { [BITCOIN_MAINNET]: [endpoint, { ...endpoint, alias: 'backup' }] },
    { 'oneclick:stellar': [{ ...endpoint, url: 'https://provider.example?token=private' }] },
    { 'oneclick:stellar': [{ ...endpoint, url: 'https://private:password@provider.example' }] },
    { 'oneclick:stellar': [{ ...endpoint, url: 'http://localhost' }] },
])('rejects invalid canonical configuration before any request (%j)', (value) => {
    expect(() => parse(value)).toThrow();
});
it('distinguishes absent configuration from malformed JSON without exposing its value', () => {
    expect(providerPools(new ConfigService())).toBeUndefined();
    expect(() => providerPools(new ConfigService({ CHAIN_RPC_ENDPOINTS_JSON: 'private-not-json' }))).toThrow(
        'must be valid JSON',
    );
});
