import { BelongsTo, Column, CreatedAt, DataType, ForeignKey, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { AppUser } from './app-user.model';

@Table({ tableName: 'wallet_links', underscored: true })
export class WalletLink extends Model<WalletLink> {
    @Column({
        type: DataType.UUID,
        defaultValue: DataType.UUIDV4,
        primaryKey: true,
    })
    declare id: string;

    @ForeignKey(() => AppUser)
    @Column({ type: DataType.UUID, allowNull: false })
    declare userId: string;

    @Column({ type: DataType.STRING, allowNull: false })
    declare privyWalletId: string;

    @Column({ type: DataType.STRING, allowNull: false })
    declare address: string;

    @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'ethereum' })
    declare chainType: string;

    @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'embedded' })
    declare walletType: string;

    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
    declare isPrimary: boolean;

    @CreatedAt
    declare createdAt: Date;

    @UpdatedAt
    declare updatedAt: Date;

    @BelongsTo(() => AppUser)
    declare user?: AppUser;
}
