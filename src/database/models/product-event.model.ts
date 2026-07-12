import { Column, CreatedAt, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'product_events', underscored: true, updatedAt: false })
export class ProductEvent extends Model<ProductEvent> {
    @Column({
        type: DataType.UUID,
        defaultValue: DataType.UUIDV4,
        primaryKey: true,
    })
    declare id: string;

    @Column({ type: DataType.STRING, allowNull: false })
    declare eventName: string;

    @Column({ type: DataType.STRING, allowNull: false })
    declare source: string;

    @Column({ type: DataType.STRING, allowNull: false })
    declare status: string;

    @Column({ type: DataType.UUID, allowNull: true })
    declare userId?: string | null;

    @Column({ type: DataType.STRING, allowNull: true })
    declare anonymousId?: string | null;

    @Column({ type: DataType.STRING, allowNull: true })
    declare sessionId?: string | null;

    @Column({ type: DataType.STRING, allowNull: true })
    declare requestId?: string | null;

    @Column({ type: DataType.STRING, allowNull: true })
    declare reasonCode?: string | null;

    @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
    declare metadata: Record<string, unknown>;

    @CreatedAt
    declare createdAt: Date;
}
