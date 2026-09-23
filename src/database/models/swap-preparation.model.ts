import { Column, CreatedAt, DataType, Model, Table } from 'sequelize-typescript';
import type { SwapExecutionMode } from '../../modules/swaps/domain/models/swap-quote';

@Table({ tableName: 'swap_preparations', underscored: true, updatedAt: false })
export class SwapPreparation extends Model<SwapPreparation> {
    @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
    declare id: string;

    @Column({ type: DataType.STRING, allowNull: false })
    declare providerId: string;

    @Column({ type: DataType.STRING, allowNull: false })
    declare executionMode: SwapExecutionMode;

    @Column({ type: DataType.STRING, allowNull: false })
    declare userAddress: string;

    @Column({ type: DataType.STRING, allowNull: false })
    declare userChainType: 'evm' | 'near';

    @Column({ type: DataType.JSONB, allowNull: false })
    declare executionPayload: Record<string, unknown>;

    @Column({ type: DataType.DATE, allowNull: false })
    declare expiresAt: Date;

    @CreatedAt
    declare createdAt: Date;
}
