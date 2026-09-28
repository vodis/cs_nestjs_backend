import { Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';

@Table({ tableName: 'wallet_link_challenges', underscored: true })
export class WalletLinkChallenge extends Model<WalletLinkChallenge> {
    @Column({ type: DataType.UUID, primaryKey: true })
    declare id: string;

    @Column({ type: DataType.UUID, allowNull: false })
    declare userId: string;

    @Column({ type: DataType.STRING, allowNull: false })
    declare address: string;

    @Column({ type: DataType.STRING, allowNull: false })
    declare chainType: string;

    @Column({ type: DataType.STRING, allowNull: false })
    declare nonce: string;

    @Column({ type: DataType.DATE, allowNull: false })
    declare expiresAt: Date;

    @Column({ type: DataType.DATE, allowNull: true })
    declare consumedAt?: Date | null;

    @Column({ type: DataType.STRING(64), allowNull: true })
    declare proofFingerprint?: string | null;

    @Column({ type: DataType.UUID, allowNull: true })
    declare walletLinkId?: string | null;

    @CreatedAt
    declare createdAt: Date;

    @UpdatedAt
    declare updatedAt: Date;
}
