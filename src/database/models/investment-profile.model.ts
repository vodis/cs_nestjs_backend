import { BelongsTo, Column, CreatedAt, DataType, ForeignKey, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { AppUser } from './app-user.model';

@Table({ tableName: 'investment_profiles', underscored: true })
export class InvestmentProfile extends Model<InvestmentProfile> {
    @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
    declare id: string;

    @ForeignKey(() => AppUser)
    @Column({ type: DataType.UUID, allowNull: false, unique: true })
    declare userId: string;

    @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'growth' })
    declare objective: 'growth' | 'income' | 'capital_preservation';

    @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'balanced' })
    declare riskTolerance: 'conservative' | 'balanced' | 'aggressive';

    @Column({ type: DataType.STRING, allowNull: false, defaultValue: '3_5y' })
    declare horizon: 'under_1y' | '1_3y' | '3_5y' | 'over_5y';

    @CreatedAt declare createdAt: Date;
    @UpdatedAt declare updatedAt: Date;
    @BelongsTo(() => AppUser) declare user?: AppUser;
}
