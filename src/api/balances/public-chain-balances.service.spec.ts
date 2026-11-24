import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AssetDto } from '../assets/dto/get-assets-response.dto';
import { PublicChainBalancesService, atomicBalance, decimalBalance } from './public-chain-balances.service';
const stellar = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const evm = '0x' + '1'.repeat(40);
const move = '0x' + '1'.repeat(64);
function asset(blockchain: string, contractAddress?: string): AssetDto {
    const id =
        blockchain === 'stellar'
            ? 'nep245:v2_1.omni.hot.tg:1100_111bzQBB5v7AhLyPMDwS8uJgQV24KaAPXtwyVWu2KXbbfQU6NXRCz'
            : `nep141:${blockchain}.omft.near`;
    return { assetId: id, defuseAssetId: id, blockchain, symbol: 'TEST', decimals: 8, contractAddress };
}
function setup(chain: string, reply: (url: string, data: Record<string, string>) => unknown, pools?: unknown) {
    const client = axios.create();
    const request = jest
        .spyOn(client, 'request')
        .mockImplementation(async (options: AxiosRequestConfig): Promise<AxiosResponse> => {
            const data = await reply(options.url ?? '', options.data ?? {});
            return { data, status: 200, statusText: 'OK', headers: {}, config: { headers: new axios.AxiosHeaders() } };
        });
    const config = new ConfigService({
        BALANCE_PROVIDERS_JSON: JSON.stringify(
            pools ?? { [chain]: [{ alias: 'primary', url: 'https://provider.example' }] },
        ),
    });
    return { service: new PublicChainBalancesService(config, new HttpService(client)), request };
}
function read(service: PublicChainBalancesService, chain: string, address: string, assets: AssetDto[]) {
    return service.getBalances({ address, chainType: chain }, `oneclick:${chain}`, assets);
}
it('preserves integer precision and rejects malformed/negative/rounded amounts', () => {
    expect(atomicBalance('900719925474099312345')).toBe('900719925474099312345');
    expect(decimalBalance('9007199254740993.1234567', 7)).toBe('90071992547409931234567');
    expect(decimalBalance('1.2300', 2)).toBe('123');
    for (const v of [null, undefined, -1, 0.1, Number.MAX_SAFE_INTEGER + 1, '1e9', '-1', '0x1'])
        expect(() => atomicBalance(v)).toThrow();
    expect(() => decimalBalance('0.00000001', 7)).toThrow();
});
it('reads Stellar native and issuer/code-bound trustlines with one account call', async () => {
    const { service, request } = setup('stellar', (url) =>
        url.includes('/accounts/')
            ? {
                  account_id: stellar,
                  balances: [
                      { asset_type: 'native', balance: '2.0000001' },
                      { asset_type: 'liquidity_pool_shares', liquidity_pool_id: 'a'.repeat(64), balance: '1.0000000' },
                      {
                          asset_type: 'credit_alphanum4',
                          asset_issuer: stellar,
                          asset_code: 'USDC',
                          balance: '3.1234567',
                      },
                      { asset_type: 'credit_alphanum4', asset_issuer: 'OTHER', asset_code: 'USDC', balance: '999' },
                  ],
              }
            : { network_passphrase: 'Public Global Stellar Network ; September 2015' },
    );
    const result = await read(service, 'stellar', stellar, [
        { ...asset('stellar'), decimals: 7 },
        { ...asset('stellar', stellar), assetId: 'usdc', symbol: 'USDC', decimals: 7 },
    ]);
    expect(result.balances.map((b) => b.balanceRaw)).toEqual(['20000001', '31234567']);
    expect(result.failures).toEqual([]);
    expect(request).toHaveBeenCalledTimes(2);
});
it.each(['wrong network', 'wrong account', 'missing list', 'empty list', 'HTTP failure'])(
    'never invents zero for Stellar %s',
    async (failure) => {
        const { service } = setup('stellar', (url) => {
            if (!url.includes('/accounts/'))
                return {
                    network_passphrase:
                        failure === 'wrong network' ? 'testnet' : 'Public Global Stellar Network ; September 2015',
                };
            if (failure === 'HTTP failure') throw new Error('secret-response-canary');
            return {
                account_id: failure === 'wrong account' ? 'other' : stellar,
                balances: failure === 'missing list' ? undefined : [],
            };
        });
        const result = await read(service, 'stellar', stellar, [{ ...asset('stellar'), decimals: 7 }]);
        expect(result.balances).toEqual([]);
        expect(result.failures).toHaveLength(1);
        expect(JSON.stringify(result)).not.toContain('canary');
    },
);
it('binds HyperCore by tokenId/index; rejects unrelated ERC20 route and duplicate symbols', async () => {
    const id = '0x6d1e7cde53ba9467b783cb7c530ce054';
    const token = { ...asset('hypercore', id), assetId: 'hip1', defuseAssetId: `1cs_v1:hypercore:hip1:${id}` };
    const { service } = setup('hypercore', (_url, body) =>
        body.type === 'spotMeta'
            ? { tokens: [{ tokenId: id, index: 0, weiDecimals: 8 }] }
            : {
                  balances: [
                      { coin: 'USDC', token: 0, total: '10.5', hold: '2.0' },
                      { coin: 'USDC', token: 12, total: '999' },
                  ],
              },
    );
    const result = await read(service, 'hypercore', evm, [
        token,
        { ...token, assetId: 'erc20', defuseAssetId: '1cs_v1:hypercore:erc20:0x123' },
    ]);
    expect(result.balances[0].balanceRaw).toBe('1050000000');
    expect(result.failures.map((f) => f.assetId)).toEqual(['erc20']);
});
it.each(['aptos', 'movement'])('checks %s identity and reads native and fungible assets', async (chain) => {
    const { service, request } = setup(chain, (url, body) =>
        url.endsWith('/view')
            ? [body.function.includes('primary_fungible_store') ? '321' : '123']
            : { chain_id: chain === 'aptos' ? 1 : 126 },
    );
    const result = await read(service, chain, move, [asset(chain), { ...asset(chain, '0x123'), assetId: 'token' }]);
    expect(result.balances.map((b) => b.balanceRaw)).toEqual(['123', '321']);
    expect(request).toHaveBeenCalledTimes(3);
});
it('rejects a wrong Move network before a balance request', async () => {
    const { service, request } = setup('aptos', () => ({ chain_id: 2 }));
    const result = await read(service, 'aptos', move, [asset('aptos')]);
    expect(result.balances).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(1);
});
it('requires configuration and rejects wrong-chain assets before I/O', async () => {
    const { service, request } = setup('aptos', () => ({}), {});
    expect((await read(service, 'aptos', move, [asset('aptos')])).failures[0].rpcIssue?.code).toBe(
        'RPC_NOT_CONFIGURED',
    );
    await expect(read(service, 'aptos', move, [asset('sui')])).rejects.toThrow('Explicit registered assets');
    expect(request).not.toHaveBeenCalled();
});
it('fails over without exposing provider errors', async () => {
    const { service, request } = setup(
        'aptos',
        (url) => {
            if (url.startsWith('https://bad.example')) throw new Error('secret-response-canary');
            return url.endsWith('/view') ? ['7'] : { chain_id: 1 };
        },
        {
            aptos: [
                { alias: 'bad', url: 'https://bad.example' },
                { alias: 'good', url: 'https://good.example' },
            ],
        },
    );
    const result = await read(service, 'aptos', move, [asset('aptos')]);
    expect(result.balances[0].balanceRaw).toBe('7');
    expect(result.balances[0].providerAlias).toBe('good');
    expect(request.mock.calls.every(([config]) => config.maxRedirects === 0)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('canary');
});

it.each(['aleo', 'miden', 'qtc', 'prl'])(
    'reports explicit unavailability for %s without guessing zero or making a request',
    async (chain) => {
        const { service, request } = setup(chain, () => {
            throw new Error('must not call');
        });
        const result = await read(service, chain, 'not-used', [asset(chain)]);
        expect(result.balances).toEqual([]);
        expect(result.failures[0].rpcIssue?.code).toBe(
            ['aleo', 'miden'].includes(chain) ? 'BALANCE_WALLET_REQUIRED' : 'BALANCE_UNSUPPORTED',
        );
        expect(request).not.toHaveBeenCalled();
    },
);
it.each(['bch', 'dash', 'doge', 'ltc', 'zec'])('reads only a complete %s address result', async (chain) => {
    const addresses: Record<string, string> = {
        bch: '1' + 'a'.repeat(25),
        dash: 'X' + 'a'.repeat(25),
        doge: 'D' + 'a'.repeat(25),
        ltc: 'L' + 'a'.repeat(25),
        zec: 't1' + 'a'.repeat(25),
    };
    const address = addresses[chain];
    const { service } = setup(chain, () => ({
        context: { code: 200 },
        data: { [address]: { address: { balance: '9007199254740993' } } },
    }));
    expect((await read(service, chain, address, [asset(chain)])).balances[0].balanceRaw).toBe('9007199254740993');
    const missing = setup(chain, () => ({ context: { code: 200 }, data: {} }));
    expect((await read(missing.service, chain, address, [asset(chain)])).failures).toHaveLength(1);
});
it('uses a validated XRP ledger and exact account with network identity', async () => {
    const address = 'r' + 'a'.repeat(25);
    const { service } = setup('xrp', (_url, body) =>
        body.method === 'server_info'
            ? { result: { info: { network_id: 0 } } }
            : {
                  result: {
                      status: 'success',
                      validated: true,
                      account_data: { Account: address, Balance: '1234567' },
                  },
              },
    );
    expect((await read(service, 'xrp', address, [{ ...asset('xrp'), decimals: 6 }])).balances[0].balanceRaw).toBe(
        '1234567',
    );
});
it('reads Cardano mainnet address balance only after checking genesis', async () => {
    const address = 'addr1' + 'a'.repeat(30);
    const { service } = setup('cardano', (url) =>
        url.endsWith('/genesis') ? [{ networkmagic: '764824073' }] : [{ address, balance: '1234567' }],
    );
    expect(
        (await read(service, 'cardano', address, [{ ...asset('cardano'), decimals: 6 }])).balances[0].balanceRaw,
    ).toBe('1234567');
});
it('reads Sui GraphQL balances and rejects GraphQL errors or wrong chain', async () => {
    const { service } = setup('sui', (_url, body) =>
        body.query === '{ chainIdentifier }'
            ? { data: { chainIdentifier: '4btiuiMPvEENsttpZC7CZ53DruC3MAgfznDbASZ7DR6S' } }
            : { data: { address: { balance: { totalBalance: '123' } } } },
    );
    expect((await read(service, 'sui', move, [{ ...asset('sui'), decimals: 9 }])).balances[0].balanceRaw).toBe('123');
    const bad = setup('sui', () => ({ errors: [{ message: 'canary' }] }));
    expect((await read(bad.service, 'sui', move, [asset('sui')])).failures).toHaveLength(1);
});
it('assembles Cairo u256 balances without loss and verifies Starknet mainnet', async () => {
    const { service } = setup('starknet', (_url, body) => ({
        jsonrpc: '2.0',
        id: 1,
        result: body.method === 'starknet_chainId' ? '0x534e5f4d41494e' : ['0x1', '0x1'],
    }));
    expect(
        (await read(service, 'starknet', move, [{ ...asset('starknet'), decimals: 18 }])).balances[0].balanceRaw,
    ).toBe(((1n << 128n) + 1n).toString());
});
it('verifies Fogo genesis before a finalized native balance', async () => {
    const { service } = setup('fogo', (_url, body) => ({
        id: 1,
        result: body.method === 'getGenesisHash' ? 'CDLtwKnaCoK157uaHQDj4fHu72AyD2519Cphmpiq6hvT' : { value: 123 },
    }));
    const token = {
        ...asset('fogo'),
        assetId: 'nep141:fogo.omdep.near',
        defuseAssetId: 'nep141:fogo.omdep.near',
        decimals: 9,
    };
    expect((await read(service, 'fogo', '11111111111111111111111111111111', [token])).balances[0].balanceRaw).toBe(
        '123',
    );
});
it('verifies TRON address checksum, genesis, native and TRC20 reads', async () => {
    const address = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    const { service } = setup('tron', (url) =>
        url.endsWith('/getblockbynum')
            ? { blockID: '00000000000000001ebf88508a03865c71d452e25f4d51194196a1d22b6653dc' }
            : url.endsWith('/getaccount')
              ? { address, balance: 123 }
              : { result: { result: true }, constant_result: ['0'.repeat(62) + 'ff'] },
    );
    const result = await read(service, 'tron', address, [
        { ...asset('tron'), decimals: 6 },
        { ...asset('tron', address), assetId: 'usdt', decimals: 6 },
    ]);
    expect(result.balances.map((b) => b.balanceRaw)).toEqual(['123', '255']);
    await expect(read(service, 'tron', address.slice(0, -1) + '1', [asset('tron')])).rejects.toThrow('checksum');
});

it('rejects malformed unrelated Stellar rows before inferring an absent trustline', async () => {
    const { service } = setup('stellar', (url) =>
        url.includes('/accounts/')
            ? { account_id: stellar, balances: [{ asset_type: 'native' }] }
            : { network_passphrase: 'Public Global Stellar Network ; September 2015' },
    );
    const result = await read(service, 'stellar', stellar, [
        { ...asset('stellar', stellar), symbol: 'USDC', decimals: 7 },
    ]);
    expect(result.balances).toEqual([]);
    expect(result.failures).toHaveLength(1);
});
it('rejects malformed HyperCore token indexes before inferring absence', async () => {
    const id = '0x6d1e7cde53ba9467b783cb7c530ce054';
    const { service } = setup('hypercore', (_url, body) =>
        body.type === 'spotMeta'
            ? { tokens: [{ tokenId: id, index: 0, weiDecimals: 8 }] }
            : { balances: [{ token: '0', total: '10' }] },
    );
    const result = await read(service, 'hypercore', evm, [
        { ...asset('hypercore', id), defuseAssetId: `1cs_v1:hypercore:hip1:${id}` },
    ]);
    expect(result.balances).toEqual([]);
    expect(result.failures).toHaveLength(1);
});
