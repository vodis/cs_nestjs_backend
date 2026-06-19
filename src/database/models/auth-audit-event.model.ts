import { Column, CreatedAt, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'auth_audit_events', underscored: true, updatedAt: false })
export class AuthAuditEvent extends Model<AuthAuditEvent> {
    @Column({
        type: DataType.UUID,
        defaultValue: DataType.UUIDV4,
        primaryKey: true,
    })
    declare id: string;

    @Column({ type: DataType.UUID, allowNull: true })
    declare userId?: string | null;

    @Column({ type: DataType.STRING, allowNull: true })
    declare privyUserId?: string | null;

    @Column({ type: DataType.STRING, allowNull: false })
    declare eventType: string;

    @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
    declare metadata: Record<string, unknown>;

    @CreatedAt
    declare createdAt: Date;
}
