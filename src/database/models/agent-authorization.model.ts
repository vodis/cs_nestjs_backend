import { Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';

@Table({
    tableName: 'agent_authorizations',
    underscored: true,
    indexes: [
        { fields: ['user_code'], unique: true },
        { fields: ['device_code_hash'], unique: true },
        {
            name: 'agent_authorizations_authorization_code_hash_unique',
            fields: ['authorization_code_hash'],
            unique: true,
        },
    ],
})
export class AgentAuthorization extends Model<AgentAuthorization> {
    @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true }) declare id: string;
    @Column({ type: DataType.UUID, allowNull: true }) declare userId?: string | null;
    @Column({ type: DataType.UUID, allowNull: true }) declare connectionId?: string | null;
    @Column({ type: DataType.STRING, allowNull: false }) declare clientId: string;
    @Column({ type: DataType.STRING, allowNull: false }) declare clientName: string;
    @Column({ type: DataType.STRING(2048), allowNull: true }) declare clientUri?: string | null;
    @Column({ type: DataType.STRING(2048), allowNull: true }) declare logoUri?: string | null;
    @Column({ type: DataType.STRING(32), allowNull: true }) declare clientVerification?:
        'metadata_document' | 'first_party' | 'unverified' | null;
    @Column({ type: DataType.STRING, allowNull: true }) declare redirectUri?: string | null;
    @Column({ type: DataType.STRING, allowNull: true }) declare state?: string | null;
    @Column({ type: DataType.STRING, allowNull: false }) declare resource: string;
    @Column({ type: DataType.JSON, allowNull: false }) declare scopes: string[];
    @Column({ type: DataType.STRING, allowNull: true }) declare codeChallenge?: string | null;
    @Column({ type: DataType.STRING(64), allowNull: true }) declare authorizationCodeHash?: string | null;
    @Column({ type: DataType.STRING(9), allowNull: true, unique: true }) declare userCode?: string | null;
    @Column({ type: DataType.STRING(64), allowNull: true, unique: true }) declare deviceCodeHash?: string | null;
    @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'pending' }) declare status:
        'pending' | 'approved' | 'denied' | 'consumed';
    @Column({ type: DataType.DATE, allowNull: false }) declare expiresAt: Date;
    @CreatedAt declare createdAt: Date;
    @UpdatedAt declare updatedAt: Date;
}
