import { AgentAuthorization } from '../../../database/models/agent-authorization.model';
import { AgentConnection } from '../../../database/models/agent-connection.model';
import { AgentCredential } from '../../../database/models/agent-credential.model';
import { AuthAuditEvent } from '../../../database/models/auth-audit-event.model';

export const AGENT_ACCESS_REPOSITORY = Symbol('AGENT_ACCESS_REPOSITORY');

export interface AgentAccessRepository {
    transaction<T>(callback: (repository: AgentAccessRepository) => Promise<T>): Promise<T>;
    createAuthorization(input: Partial<AgentAuthorization>): Promise<AgentAuthorization>;
    authorizationById(id: string, forUpdate?: boolean): Promise<AgentAuthorization | null>;
    authorizationByUserCode(code: string, forUpdate?: boolean): Promise<AgentAuthorization | null>;
    authorizationByDeviceHash(hash: string, forUpdate?: boolean): Promise<AgentAuthorization | null>;
    authorizationByCodeHash(hash: string, forUpdate?: boolean): Promise<AgentAuthorization | null>;
    saveAuthorization(record: AgentAuthorization): Promise<void>;
    createConnection(input: Partial<AgentConnection>): Promise<AgentConnection>;
    connectionById(id: string, forUpdate?: boolean): Promise<AgentConnection | null>;
    connectionsForUser(userId: string): Promise<AgentConnection[]>;
    saveConnection(record: AgentConnection): Promise<void>;
    createCredential(input: Partial<AgentCredential>): Promise<AgentCredential>;
    credentialByHash(hash: string, kind: 'access' | 'refresh', forUpdate?: boolean): Promise<AgentCredential | null>;
    saveCredential(record: AgentCredential): Promise<void>;
    revokeFamily(familyId: string): Promise<void>;
    revokeConnectionCredentials(connectionId: string): Promise<void>;
    createAuditEvent(input: Partial<AuthAuditEvent>): Promise<AuthAuditEvent>;
}
