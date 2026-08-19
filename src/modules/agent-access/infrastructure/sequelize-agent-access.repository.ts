import { Injectable } from '@nestjs/common';
import { AgentAuthorization } from '../../../database/models/agent-authorization.model';
import { AgentConnection } from '../../../database/models/agent-connection.model';
import { AgentCredential } from '../../../database/models/agent-credential.model';
import { AgentAccessRepository } from '../application/agent-access.repository';

@Injectable()
export class SequelizeAgentAccessRepository implements AgentAccessRepository {
    createAuthorization(input: Partial<AgentAuthorization>) {
        return AgentAuthorization.create(input);
    }
    authorizationById(id: string) {
        return AgentAuthorization.findByPk(id);
    }
    authorizationByUserCode(userCode: string) {
        return AgentAuthorization.findOne({ where: { userCode } });
    }
    authorizationByDeviceHash(deviceCodeHash: string) {
        return AgentAuthorization.findOne({ where: { deviceCodeHash } });
    }
    authorizationByCodeHash(authorizationCodeHash: string) {
        return AgentAuthorization.findOne({ where: { authorizationCodeHash } });
    }
    async saveAuthorization(record: AgentAuthorization) {
        await record.save();
    }
    createConnection(input: Partial<AgentConnection>) {
        return AgentConnection.create(input);
    }
    connectionById(id: string) {
        return AgentConnection.findByPk(id);
    }
    connectionsForUser(userId: string) {
        return AgentConnection.findAll({ where: { userId }, order: [['createdAt', 'DESC']] });
    }
    async saveConnection(record: AgentConnection) {
        await record.save();
    }
    createCredential(input: Partial<AgentCredential>) {
        return AgentCredential.create(input);
    }
    credentialByHash(tokenHash: string, kind: 'access' | 'refresh') {
        return AgentCredential.findOne({ where: { tokenHash, kind } });
    }
    async revokeFamily(familyId: string) {
        await AgentCredential.update({ revokedAt: new Date() }, { where: { familyId, revokedAt: null } });
    }
    async revokeConnectionCredentials(connectionId: string) {
        await AgentCredential.update({ revokedAt: new Date() }, { where: { connectionId, revokedAt: null } });
    }
}
