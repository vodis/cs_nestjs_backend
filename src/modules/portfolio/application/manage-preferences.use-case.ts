import { Inject, Injectable } from '@nestjs/common';
import { PORTFOLIO_REPOSITORY, PortfolioRepository } from './portfolio.ports';
import { InvestmentPreferences } from './portfolio.types';

const DEFAULTS: InvestmentPreferences = { objective: 'growth', riskTolerance: 'balanced', horizon: '3_5y' };

@Injectable()
export class ManagePreferencesUseCase {
    constructor(@Inject(PORTFOLIO_REPOSITORY) private readonly repository: PortfolioRepository) {}

    async get(userId: string) {
        const stored = await this.repository.getPreferences(userId);
        return stored
            ? { ...stored, updatedAt: stored.updatedAt.toISOString() }
            : { ...DEFAULTS, updatedAt: new Date(0).toISOString() };
    }

    async save(userId: string, input: InvestmentPreferences) {
        const stored = await this.repository.savePreferences(userId, input);
        return { ...stored, updatedAt: stored.updatedAt.toISOString() };
    }
}
