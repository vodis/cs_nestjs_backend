import { BelongsTo, Column, CreatedAt, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { AgentConnection } from './agent-connection.model';

@Table({
    tableName: 'agent_credentials',
    underscored: true,
    updatedAt: false,
    indexes: [{ fields: ['token_hash'], unique: true }, { fields: ['family_id'] }],
})
export class AgentCredential extends Model<AgentCredential> {
    @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true }) declare id: string;
    @ForeignKey(() => AgentConnection)
    @Column({ type: DataType.UUID, allowNull: false })
    declare connectionId: string;
    @Column({ type: DataType.STRING, allowNull: false }) declare kind: 'access' | 'refresh';
    @Column({ type: DataType.STRING(64), allowNull: false, unique: true }) declare tokenHash: string;
    @Column({ type: DataType.UUID, allowNull: false }) declare familyId: string;
    @Column({ type: DataType.DATE, allowNull: false }) declare expiresAt: Date;
    @Column({ type: DataType.DATE, allowNull: true }) declare usedAt?: Date | null;
    @Column({ type: DataType.DATE, allowNull: true }) declare revokedAt?: Date | null;
    @CreatedAt declare createdAt: Date;
    @BelongsTo(() => AgentConnection) declare connection?: AgentConnection;
}
