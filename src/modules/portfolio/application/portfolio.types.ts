export type InvestmentPreferences = {
    objective: 'growth' | 'income' | 'capital_preservation';
    riskTolerance: 'conservative' | 'balanced' | 'aggressive';
    horizon: 'under_1y' | '1_3y' | '3_5y' | 'over_5y';
};

export type PortfolioBalance = {
    walletReference: string;
    chain: string;
    assetId: string;
    symbol: string;
    quantity: string;
    balanceUpdatedAt: Date;
};

export type PortfolioBalanceQuery = {
    walletAddress?: string;
    network?: string;
};

export type PortfolioAsset = {
    assetId: string;
    priceUsd: string | null;
    priceUpdatedAt: string | null;
};
