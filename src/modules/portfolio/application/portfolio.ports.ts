import { InvestmentPreferences, PortfolioAsset, PortfolioBalance } from './portfolio.types';

export const PORTFOLIO_REPOSITORY = Symbol('PORTFOLIO_REPOSITORY');
export const PORTFOLIO_ASSET_SOURCE = Symbol('PORTFOLIO_ASSET_SOURCE');

export interface PortfolioRepository {
    balancesForUser(userId: string): Promise<PortfolioBalance[]>;
    getPreferences(userId: string): Promise<(InvestmentPreferences & { updatedAt: Date }) | null>;
    savePreferences(userId: string, input: InvestmentPreferences): Promise<InvestmentPreferences & { updatedAt: Date }>;
}

export interface PortfolioAssetSource {
    getAssets(): Promise<PortfolioAsset[]>;
}
