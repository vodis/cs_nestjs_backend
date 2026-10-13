export const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
export const BITCOIN_MAINNET = 'bip122:000000000019d6689c085ae165831e93';

export const EVM_NETWORKS: Readonly<Record<string, string>> = {
    abs: 'eip155:2741',
    eth: 'eip155:1',
    op: 'eip155:10',
    bsc: 'eip155:56',
    gnosis: 'eip155:100',
    pol: 'eip155:137',
    base: 'eip155:8453',
    arb: 'eip155:42161',
    avax: 'eip155:43114',
    scroll: 'eip155:534352',
    bera: 'eip155:80094',
    monad: 'eip155:143',
    xlayer: 'eip155:196',
    plasma: 'eip155:9745',
    adi: 'eip155:36900',
    hood: 'eip155:4663',
    hlevm: 'eip155:999',
};

// Explicit provider route IDs: absence of a contract alone never means native.
export const NATIVE_ROUTES: Readonly<Record<string, string>> = {
    abs: 'nep141:abs.omdep.near',
    eth: 'nep141:eth.omft.near',
    arb: 'nep141:arb.omft.near',
    base: 'nep141:base.omft.near',
    gnosis: 'nep141:gnosis.omft.near',
    op: 'nep245:v2_1.omni.hot.tg:10_11111111111111111111',
    bsc: 'nep245:v2_1.omni.hot.tg:56_11111111111111111111',
    pol: 'nep245:v2_1.omni.hot.tg:137_11111111111111111111',
    avax: 'nep245:v2_1.omni.hot.tg:43114_11111111111111111111',
    scroll: 'nep245:v2_1.omni.hot.tg:534352_11111111111111111111',
    bera: 'nep141:bera.omft.near',
    monad: 'nep245:v2_1.omni.hot.tg:143_11111111111111111111',
    xlayer: 'nep245:v2_1.omni.hot.tg:196_11111111111111111111',
    plasma: 'nep141:plasma.omft.near',
    adi: 'nep245:v2_1.omni.hot.tg:36900_11111111111111111111',
    hood: 'nep141:hood.omft.near',
    sol: 'nep141:sol.omft.near',
    btc: 'nep141:btc.omft.near',
    ton: 'nep245:v2_1.omni.hot.tg:1117_',
};

export const SOURCE_NETWORKS: Readonly<Record<string, string>> = {
    ...EVM_NETWORKS,
    near: 'near:mainnet',
    ton: 'ton:mainnet',
    sol: SOLANA_MAINNET,
    btc: BITCOIN_MAINNET,
};
