import { Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';

export type SwapExecutionStatus = 'pending' | 'succeeded' | 'failed';

@Table({
    tableName: 'swap_executions',
    underscored: true,
    indexes: [
        { name: 'swap_executions_user_idempotency_unique', unique: true, fields: ['user_id', 'idempotency_key'] },
        { name: 'swap_executions_user_fingerprint_unique', unique: true, fields: ['user_id', 'request_fingerprint'] },
    ],
})
export class SwapExecution extends Model<SwapExecution> {
    @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
    declare id: string;

    @Column({ type: DataType.UUID, allowNull: false })
    declare preparationId: string;

    @Column({ type: DataType.UUID, allowNull: false })
    declare userId: string;

    @Column({ type: DataType.STRING(128), allowNull: false })
    declare idempotencyKey: string;

    @Column({ type: DataType.STRING(64), allowNull: false })
    declare requestFingerprint: string;

    @Column({ type: DataType.STRING, allowNull: false })
    declare providerId: string;

    @Column({ type: DataType.STRING, allowNull: false })
    declare traceId: string;

    @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'pending' })
    declare status: SwapExecutionStatus;

    @Column({ type: DataType.STRING, allowNull: true })
    declare intentHash?: string | null;

    @Column({ type: DataType.STRING, allowNull: true })
    declare failureCode?: string | null;

    @CreatedAt
    declare createdAt: Date;

    @UpdatedAt
    declare updatedAt: Date;
}
