import { Inject, Injectable, Optional } from '@nestjs/common';
import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { SEQUELIZE } from '../../../database/database.tokens';
import { AgentAuthorization } from '../../../database/models/agent-authorization.model';
import { AgentConnection } from '../../../database/models/agent-connection.model';
import { AgentCredential } from '../../../database/models/agent-credential.model';
import { AuthAuditEvent } from '../../../database/models/auth-audit-event.model';
import { AgentAccessRepository } from '../application/agent-access.repository';

@Injectable()
export class SequelizeAgentAccessRepository implements AgentAccessRepository {
    constructor(
        @Inject(SEQUELIZE) private readonly sequelize: Sequelize,
        @Optional() private readonly activeTransaction?: Transaction,
    ) {}

    transaction<T>(callback: (repository: AgentAccessRepository) => Promise<T>): Promise<T> {
        if (this.activeTransaction) return callback(this);
        return this.sequelize.transaction((transaction) =>
            callback(new SequelizeAgentAccessRepository(this.sequelize, transaction)),
        );
    }

    private queryOptions(forUpdate = false) {
        return this.activeTransaction && forUpdate
            ? { transaction: this.activeTransaction, lock: this.activeTransaction.LOCK.UPDATE }
            : { transaction: this.activeTransaction };
    }

    createAuthorization(input: Partial<AgentAuthorization>) {
        return AgentAuthorization.create(input, { transaction: this.activeTransaction });
    }
    authorizationById(id: string, forUpdate = false) {
        return AgentAuthorization.findByPk(id, this.queryOptions(forUpdate));
    }
    authorizationByUserCode(userCode: string, forUpdate = false) {
        return AgentAuthorization.findOne({ where: { userCode }, ...this.queryOptions(forUpdate) });
    }
    authorizationByDeviceHash(deviceCodeHash: string, forUpdate = false) {
        return AgentAuthorization.findOne({ where: { deviceCodeHash }, ...this.queryOptions(forUpdate) });
    }
    authorizationByCodeHash(authorizationCodeHash: string, forUpdate = false) {
        return AgentAuthorization.findOne({ where: { authorizationCodeHash }, ...this.queryOptions(forUpdate) });
    }
    async saveAuthorization(record: AgentAuthorization) {
        await record.save({ transaction: this.activeTransaction });
    }
    createConnection(input: Partial<AgentConnection>) {
        return AgentConnection.create(input, { transaction: this.activeTransaction });
    }
    connectionById(id: string, forUpdate = false) {
        return AgentConnection.findByPk(id, this.queryOptions(forUpdate));
    }
    connectionsForUser(userId: string) {
        return AgentConnection.findAll({
            where: { userId },
            order: [['createdAt', 'DESC']],
            transaction: this.activeTransaction,
        });
    }
    async saveConnection(record: AgentConnection) {
        await record.save({ transaction: this.activeTransaction });
    }
    createCredential(input: Partial<AgentCredential>) {
        return AgentCredential.create(input, { transaction: this.activeTransaction });
    }
    credentialByHash(tokenHash: string, kind: 'access' | 'refresh', forUpdate = false) {
        return AgentCredential.findOne({ where: { tokenHash, kind }, ...this.queryOptions(forUpdate) });
    }
    async saveCredential(record: AgentCredential) {
        await record.save({ transaction: this.activeTransaction });
    }
    async revokeFamily(familyId: string) {
        await AgentCredential.update(
            { revokedAt: new Date() },
            { where: { familyId, revokedAt: null }, transaction: this.activeTransaction },
        );
    }
    async revokeConnectionCredentials(connectionId: string) {
        await AgentCredential.update(
            { revokedAt: new Date() },
            { where: { connectionId, revokedAt: null }, transaction: this.activeTransaction },
        );
    }
    createAuditEvent(input: Partial<AuthAuditEvent>) {
        return AuthAuditEvent.create(input, { transaction: this.activeTransaction });
    }
}
