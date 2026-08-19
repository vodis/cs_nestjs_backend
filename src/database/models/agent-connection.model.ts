import {
    BelongsTo,
    Column,
    CreatedAt,
    DataType,
    ForeignKey,
    HasMany,
    Model,
    Table,
    UpdatedAt,
} from 'sequelize-typescript';
import { AppUser } from './app-user.model';
import { AgentCredential } from './agent-credential.model';

@Table({ tableName: 'agent_connections', underscored: true, indexes: [{ fields: ['user_id', 'status'] }] })
export class AgentConnection extends Model<AgentConnection> {
    @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true }) declare id: string;
    @ForeignKey(() => AppUser)
    @Column({ type: DataType.UUID, allowNull: false })
    declare userId: string;
    @Column({ type: DataType.STRING, allowNull: false }) declare clientId: string;
    @Column({ type: DataType.STRING, allowNull: false }) declare clientName: string;
    @Column({ type: DataType.JSON, allowNull: false }) declare scopes: string[];
    @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'active' }) declare status:
        'active' | 'expired' | 'revoked';
    @Column({ type: DataType.DATE, allowNull: false }) declare expiresAt: Date;
    @Column({ type: DataType.DATE, allowNull: true }) declare lastUsedAt?: Date | null;
    @CreatedAt declare createdAt: Date;
    @UpdatedAt declare updatedAt: Date;
    @BelongsTo(() => AppUser) declare user?: AppUser;
    @HasMany(() => AgentCredential) declare credentials?: AgentCredential[];
}
