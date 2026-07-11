import { Column, CreatedAt, DataType, HasMany, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { WalletLink } from './wallet-link.model';

export type AppUserStatus = 'active' | 'pending_deletion' | 'deleted';

@Table({ tableName: 'app_users', underscored: true })
export class AppUser extends Model<AppUser> {
    @Column({
        type: DataType.UUID,
        defaultValue: DataType.UUIDV4,
        primaryKey: true,
    })
    declare id: string;

    @Column({ type: DataType.STRING, allowNull: false, unique: true })
    declare privyUserId: string;

    @Column({ type: DataType.STRING, allowNull: true })
    declare email?: string | null;

    @Column({ type: DataType.STRING, allowNull: true })
    declare authMethod?: string | null;

    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
    declare passkeyEnabled: boolean;

    @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'active' })
    declare status: AppUserStatus;

    @Column({ type: DataType.DATE, allowNull: true })
    declare deletedAt?: Date | null;

    @Column({ type: DataType.DATE, allowNull: true })
    declare deletionRequestedAt?: Date | null;

    @Column({ type: DataType.DATE, allowNull: true })
    declare deletionAvailableAt?: Date | null;

    @CreatedAt
    declare createdAt: Date;

    @UpdatedAt
    declare updatedAt: Date;

    @HasMany(() => WalletLink)
    declare wallets?: WalletLink[];
}
