import { InvestmentPreferences, PortfolioAsset, PortfolioBalance, PortfolioBalanceQuery } from './portfolio.types';

export const PORTFOLIO_REPOSITORY = Symbol('PORTFOLIO_REPOSITORY');
export const PORTFOLIO_ASSET_SOURCE = Symbol('PORTFOLIO_ASSET_SOURCE');
export const PORTFOLIO_BALANCE_SOURCE = Symbol('PORTFOLIO_BALANCE_SOURCE');

export interface PortfolioRepository {
    getPreferences(userId: string): Promise<(InvestmentPreferences & { updatedAt: Date }) | null>;
    savePreferences(userId: string, input: InvestmentPreferences): Promise<InvestmentPreferences & { updatedAt: Date }>;
}

export interface PortfolioBalanceSource {
    balancesForUser(userId: string, query?: PortfolioBalanceQuery): Promise<PortfolioBalance[]>;
}

export interface PortfolioAssetSource {
    getAssets(): Promise<PortfolioAsset[]>;
}
