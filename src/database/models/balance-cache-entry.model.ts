import { BelongsTo, Column, CreatedAt, DataType, ForeignKey, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { AppUser } from './app-user.model';
import { WalletLink } from './wallet-link.model';

@Table({
    tableName: 'balance_cache_entries',
    underscored: true,
    indexes: [
        { fields: ['user_id'] },
        { fields: ['wallet_id'] },
        { fields: ['expires_at'] },
        { fields: ['user_id', 'wallet_id', 'asset_id'], unique: true },
    ],
})
export class BalanceCacheEntry extends Model<BalanceCacheEntry> {
    @Column({
        type: DataType.UUID,
        defaultValue: DataType.UUIDV4,
        primaryKey: true,
    })
    declare id: string;

    @ForeignKey(() => AppUser)
    @Column({ type: DataType.UUID, allowNull: false })
    declare userId: string;

    @ForeignKey(() => WalletLink)
    @Column({ type: DataType.UUID, allowNull: false })
    declare walletId: string;

    @Column({ type: DataType.STRING, allowNull: false })
    declare walletAddress: string;

    @Column({ type: DataType.STRING, allowNull: false })
    declare chainType: string;

    @Column({ type: DataType.STRING, allowNull: false })
    declare assetId: string;

    @Column({ type: DataType.STRING, allowNull: false })
    declare symbol: string;

    @Column({ type: DataType.INTEGER, allowNull: false })
    declare decimals: number;

    @Column({ type: DataType.STRING, allowNull: false, defaultValue: '0' })
    declare balanceRaw: string;

    @Column({ type: DataType.STRING, allowNull: true })
    declare balanceDecimal?: string | null;

    @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'postgres_cache' })
    declare source: string;

    @Column({ type: DataType.DATE, allowNull: false })
    declare fetchedAt: Date;

    @Column({ type: DataType.DATE, allowNull: false })
    declare expiresAt: Date;

    @CreatedAt
    declare createdAt: Date;

    @UpdatedAt
    declare updatedAt: Date;

    @BelongsTo(() => AppUser)
    declare user?: AppUser;

    @BelongsTo(() => WalletLink)
    declare wallet?: WalletLink;
}
