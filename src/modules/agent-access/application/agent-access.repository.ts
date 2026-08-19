import { AgentAuthorization } from '../../../database/models/agent-authorization.model';
import { AgentConnection } from '../../../database/models/agent-connection.model';
import { AgentCredential } from '../../../database/models/agent-credential.model';

export const AGENT_ACCESS_REPOSITORY = Symbol('AGENT_ACCESS_REPOSITORY');

export interface AgentAccessRepository {
    createAuthorization(input: Partial<AgentAuthorization>): Promise<AgentAuthorization>;
    authorizationById(id: string): Promise<AgentAuthorization | null>;
    authorizationByUserCode(code: string): Promise<AgentAuthorization | null>;
    authorizationByDeviceHash(hash: string): Promise<AgentAuthorization | null>;
    authorizationByCodeHash(hash: string): Promise<AgentAuthorization | null>;
    saveAuthorization(record: AgentAuthorization): Promise<void>;
    createConnection(input: Partial<AgentConnection>): Promise<AgentConnection>;
    connectionById(id: string): Promise<AgentConnection | null>;
    connectionsForUser(userId: string): Promise<AgentConnection[]>;
    saveConnection(record: AgentConnection): Promise<void>;
    createCredential(input: Partial<AgentCredential>): Promise<AgentCredential>;
    credentialByHash(hash: string, kind: 'access' | 'refresh'): Promise<AgentCredential | null>;
    revokeFamily(familyId: string): Promise<void>;
    revokeConnectionCredentials(connectionId: string): Promise<void>;
}
