export const EVM_NETWORKS: Readonly<Record<string, string>> = {
    eth: 'eip155:1',
    op: 'eip155:10',
    bsc: 'eip155:56',
    gnosis: 'eip155:100',
    pol: 'eip155:137',
    base: 'eip155:8453',
    arb: 'eip155:42161',
    avax: 'eip155:43114',
    scroll: 'eip155:534352',
};

// Explicit provider route IDs: absence of a contract alone never means native.
export const NATIVE_ROUTES: Readonly<Record<string, string>> = {
    eth: 'nep141:eth.omft.near',
    arb: 'nep141:arb.omft.near',
    base: 'nep141:base.omft.near',
    gnosis: 'nep141:gnosis.omft.near',
    op: 'nep245:v2_1.omni.hot.tg:10_11111111111111111111',
    bsc: 'nep245:v2_1.omni.hot.tg:56_11111111111111111111',
    pol: 'nep245:v2_1.omni.hot.tg:137_11111111111111111111',
    avax: 'nep245:v2_1.omni.hot.tg:43114_11111111111111111111',
    scroll: 'nep245:v2_1.omni.hot.tg:534352_11111111111111111111',
    ton: 'nep245:v2_1.omni.hot.tg:1117_',
};
