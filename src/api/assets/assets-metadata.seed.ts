/* eslint-disable max-len, quotes */
export type AssetMetadata = {
    name: string;
    icon: string;
};

const bySymbol: Record<string, AssetMetadata> = {
    AAVE: {
        name: 'Aave',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/7278.png',
    },
    ADA: {
        name: 'Cardano',
        icon: 'https://near.com/static/icons/network/cardano.png',
    },
    ADI: {
        name: 'ADI',
        icon: 'https://near.com/static/icons/network/adi.png',
    },
    ALEO: {
        name: 'Aleo',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/32193.png',
    },
    APT: {
        name: 'Aptos',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/21794.png',
    },
    ARB: {
        name: 'Arbitrum',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/11841.png',
    },
    ASTER: {
        name: 'Aster',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/36341.png',
    },
    AURORA: {
        name: 'Aurora',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/14803.png',
    },
    AVAX: {
        name: 'Avalanche',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/5805.png',
    },
    BCH: {
        name: 'Bitcoin Cash',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/1831.png',
    },
    BERA: {
        name: 'Berachain',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/24647.png',
    },
    BNB: {
        name: 'Binance Coin',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/1839.png',
    },
    BOME: {
        name: 'BOOK OF MEME',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/29870.png',
    },
    BRETT: {
        name: 'Brett',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/29743.png',
    },
    BRRR: {
        name: 'Burrow',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/20604.png',
    },
    BTC: {
        name: 'Bitcoin',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/1.png',
    },
    'BTC (LEGACY)': {
        name: 'Bitcoin (Legacy)',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/1.png',
    },
    cbBTC: {
        name: 'Coinbase Wrapped BTC',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/32994.png',
    },
    CFI: {
        name: 'ConsumerFi Protocol',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/39057.png',
    },
    COW: {
        name: 'CoW Protocol',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/19269.png',
    },
    DAI: {
        name: 'DAI',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/4943.png',
    },
    DASH: {
        name: 'Dash',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/131.png',
    },
    DOGE: {
        name: 'Dogecoin',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/74.png',
    },
    ETH: {
        name: 'Ethereum',
        icon: 'https://near.com/static/icons/network/ethereum.png',
    },
    EURe: {
        name: 'Monerium EUR emoney',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/20920.png',
    },
    GBPe: {
        name: 'Monerium GBP emoney',
        icon: 'https://assets.coingecko.com/coins/images/39004/standard/gbp.png?1719840784',
    },
    GMX: {
        name: 'GMX',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/11857.png',
    },
    GNO: {
        name: 'Gnosis',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/1659.png',
    },
    HAPI: {
        name: 'HAPI Protocol',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/8567.png',
    },
    INX: {
        name: 'Infinex',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/39461.png',
    },
    KAITO: {
        name: 'KAITO',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/64x64/35763.png',
    },
    KNC: {
        name: 'Kyber Network Crystal v2',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/64x64/9444.png',
    },
    LINK: {
        name: 'Chainlink',
        icon: 'https://near.com/static/icons/network/link.png',
    },
    LTC: {
        name: 'Litecoin',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/2.png',
    },
    MELANIA: {
        name: 'Official Melania Meme',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/35347.png',
    },
    MOG: {
        name: 'Mog Coin',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/27659.png',
    },
    MON: {
        name: 'Monad',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/30495.png',
    },
    NEAR: {
        name: 'NEAR Protocol',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/6535.png',
    },
    OKB: {
        name: 'OKB',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/3897.png',
    },
    OP: {
        name: 'Optimism',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/11840.png',
    },
    PENGU: {
        name: 'Pudgy Penguins',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/34466.png',
    },
    PEPE: {
        name: 'Pepe',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/24478.png',
    },
    POL: {
        name: 'Polygon Ecosystem Token',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/28321.png',
    },
    PUBLIC: {
        name: 'PublicAI',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/37728.png',
    },
    REF: {
        name: 'Ref Finance',
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='16 24 248 248' style='background: %23000'%3E%3Cpath d='M164,164v52h52Zm-45-45,20.4,20.4,20.6-20.6V81H119Zm0,18.39V216h41V137.19l-20.6,20.6ZM166.5,81H164v33.81l26.16-26.17A40.29,40.29,0,0,0,166.5,81ZM72,153.19V216h43V133.4l-11.6-11.61Zm0-18.38,31.4-31.4L115,115V81H72ZM207,121.5h0a40.29,40.29,0,0,0-7.64-23.66L164,133.19V162h2.5A40.5,40.5,0,0,0,207,121.5Z' fill='%23fff'/%3E%3Cpath d='M189 72l27 27V72h-27z' fill='%2300c08b'/%3E%3C/svg%3E%0A",
    },
    RHEA: {
        name: 'RHEA Finance',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/37529.png',
    },
    SAFE: {
        name: 'Safe',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/21585.png',
    },
    SHIB: {
        name: 'Shiba Inu',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/5994.png',
    },
    SOL: {
        name: 'Solana',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/5426.png',
    },
    SPX: {
        name: 'SPX6900',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/28081.png',
    },
    STRK: {
        name: 'Starknet',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/22691.png',
    },
    SUI: {
        name: 'SUI',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/20947.png',
    },
    SWEAT: {
        name: 'Sweat Economy',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/21351.png',
    },
    TITN: {
        name: 'Titan',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/36271.png',
    },
    TON: {
        name: 'Toncoin',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/11419.png',
    },
    TRUMP: {
        name: 'OFFICIAL TRUMP',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/35336.png',
    },
    TRX: {
        name: 'TRON',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1958.png',
    },
    TURBO: {
        name: 'Turbo',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/24911.png',
    },
    UNI: {
        name: 'Uniswap',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/7083.png',
    },
    USAD: {
        name: 'USAD',
        icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nMTYwJyBoZWlnaHQ9JzE2MCcgdmlld0JveD0nMCAwIDE2MCAxNjAnIGZpbGw9J25vbmUnIHhtbG5zPSdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc+PG1hc2sgaWQ9J21hc2swXzMzMF8xNScgc3R5bGU9J21hc2stdHlwZTpsdW1pbmFuY2UnIG1hc2tVbml0cz0ndXNlclNwYWNlT25Vc2UnIHg9JzAnIHk9JzAnIHdpZHRoPScxNjAnIGhlaWdodD0nMTYwJz48cGF0aCBkPSdNMTYwIDBIMFYxNjBIMTYwVjBaJyBmaWxsPSd3aGl0ZScvPjwvbWFzaz48ZyBtYXNrPSd1cmwoI21hc2swXzMzMF8xNSknPjxwYXRoIGQ9J00xNjAgMEg4MEgwVjg3LjI1M0MwIDExNC44MjkgMTcuNjYzIDEzOS4zMDQgNDMuODM0IDE0Ny45OTNMODAgMTYwTDExNi4xNjYgMTQ3Ljk5M0MxNDIuMzM3IDEzOS4zMDQgMTYwIDExNC44MjkgMTYwIDg3LjI1M1YwWicgZmlsbD0nYmxhY2snLz48L2c+PC9zdmc+',
    },
    USDC: {
        name: 'USD Coin',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/3408.png',
    },
    USDCx: {
        name: 'USDCx',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/39544.png',
    },
    USDf: {
        name: 'Falcon USD',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/35721.png',
    },
    USD1: {
        name: 'World Liberty Financial USD',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/36148.png',
    },
    USDT: {
        name: 'Tether USD',
        icon: 'https://near.com/static/icons/network/usdt.png',
    },
    VVV: {
        name: 'Venice Token',
        icon: 'https://assets.coingecko.com/coins/images/54023/standard/VVV_Token_Transparent.png?1741856877',
    },
    WBTC: {
        name: 'Wrapped Bitcoin',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/3717.png',
    },
    WIF: {
        name: 'dogwifhat',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/28752.png',
    },
    XAUT: {
        name: 'Tether Gold',
        icon: 'https://near.com/static/icons/token/xaut.svg',
    },
    XLM: {
        name: 'Stellar Lumens',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/512.png',
    },
    XPL: {
        name: 'Plasma',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/36645.png',
    },
    XRP: {
        name: 'XRP',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/52.png',
    },
    xBTC: {
        name: 'OKX Wrapped BTC',
        icon: 'https://near-intents.org/static/icons/token/xbtc.png',
    },
    ZEC: {
        name: 'Zcash',
        icon: 'https://s2.coinmarketcap.com/static/img/coins/128x128/1437.png',
    },
};

const byAssetId: Record<string, AssetMetadata> = {
    'nep141:wrap.near': bySymbol.NEAR,
    'nep141:usdt.tether-token.near': bySymbol.USDT,
    'nep141:eth.bridge.near': bySymbol.ETH,
    'nep141:aurora': bySymbol.ETH,
    'nep141:nbtc.bridge.near': bySymbol.BTC,
    'nep141:btc.omft.near': bySymbol['BTC (LEGACY)'],
    'nep141:zec.omft.near': bySymbol.ZEC,
    '1cs_v1:near:nep141:zec.omft.near': bySymbol.ZEC,
    'nep141:token.sweat': bySymbol.SWEAT,
    'nep141:token.rhealab.near': bySymbol.RHEA,
    'nep141:token.publicailab.near': bySymbol.PUBLIC,
    'nep141:token.v2.ref-finance.near': bySymbol.REF,
    'nep141:mpdao-token.near': {
        name: 'Meta DAO Governance Token',
        icon: "data:image/svg+xml,%3csvg width='96' height='96' viewBox='0 0 96 96' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='96' height='96' rx='48' fill='white'/%3e%3cpath d='M29.2241 28.7456C28.396 27.9423 27.0094 28.5289 27.0091 29.6825L27 66.6773C26.9997 67.8501 28.4257 68.4286 29.2426 67.5872L48.6529 47.5943L29.2241 28.7456Z' fill='%23231B51'/%3e%3cpath d='M66.7759 28.7456C67.604 27.9423 68.9906 28.5289 68.9909 29.6825L69 66.6773C69.0003 67.8501 67.5743 68.4286 66.7574 67.5872L47.3471 47.5943L66.7759 28.7456Z' fill='%23231B51'/%3e%3c/svg%3e",
    },
    'nep141:score.aidols.near': {
        name: 'Trust Score',
        icon: '',
    },
    'nep141:cfi.consumer-fi.near': bySymbol.CFI,
    'nep141:npro.nearmobile.near': {
        name: 'NPRO',
        icon: '',
    },
};

export function getSeedAssetMetadata(assetId: string, symbol: string): AssetMetadata | undefined {
    return byAssetId[assetId] ?? bySymbol[symbol] ?? bySymbol[symbol.toUpperCase()];
}
