import { Injectable } from '@nestjs/common';
import { InvestmentProfile } from '../../../database/models/investment-profile.model';
import { PortfolioRepository } from '../application/portfolio.ports';
import { InvestmentPreferences } from '../application/portfolio.types';

@Injectable()
export class SequelizePortfolioRepository implements PortfolioRepository {
    async getPreferences(userId: string) {
        const profile = await InvestmentProfile.findOne({ where: { userId } });
        return profile ? this.serialize(profile) : null;
    }

    async savePreferences(userId: string, input: InvestmentPreferences) {
        const [profile] = await InvestmentProfile.upsert({ userId, ...input }, { returning: true });
        return this.serialize(profile);
    }

    private serialize(profile: InvestmentProfile) {
        return {
            objective: profile.objective,
            riskTolerance: profile.riskTolerance,
            horizon: profile.horizon,
            updatedAt: profile.updatedAt,
        };
    }
}
