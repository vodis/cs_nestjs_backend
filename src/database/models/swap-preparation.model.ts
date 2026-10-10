import { Column, CreatedAt, DataType, Model, Table } from 'sequelize-typescript';
import type { SwapExecutionMode } from '../../modules/swaps/domain/models/swap-quote';
import type { OneClickTerminalStatus } from '../../modules/swaps/domain/models/swap-settlement-status';

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
    declare userChainType: 'evm' | 'near' | 'ton';

    @Column({ type: DataType.JSONB, allowNull: false })
    declare executionPayload: Record<string, unknown>;

    @Column({ type: DataType.DATE, allowNull: false })
    declare expiresAt: Date;

    @Column({ type: DataType.STRING, allowNull: true })
    declare settlementStatus?: OneClickTerminalStatus | null;

    @Column({ type: DataType.UUID, allowNull: true })
    declare userId?: string;

    @Column({ type: DataType.JSONB, allowNull: true })
    declare historyData?: import('../../modules/swaps/domain/models/swap-history').SwapHistoryDetails;

    @Column({ type: DataType.DATE, allowNull: true })
    declare attemptStartedAt?: Date;

    @CreatedAt
    declare createdAt: Date;
}
