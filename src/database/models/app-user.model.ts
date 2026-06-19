import {
    Column,
    CreatedAt,
    DataType,
    HasMany,
    Model,
    Table,
    UpdatedAt,
} from 'sequelize-typescript';
import { WalletLink } from './wallet-link.model';

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

    @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'active' })
    declare status: 'active' | 'disabled';

    @CreatedAt
    declare createdAt: Date;

    @UpdatedAt
    declare updatedAt: Date;

    @HasMany(() => WalletLink)
    declare wallets?: WalletLink[];
}
