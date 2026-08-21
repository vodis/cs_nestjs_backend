import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { AGENT_ACCESS_REPOSITORY, AgentAccessRepository } from './agent-access.repository';
import {
    AGENT_SCOPES,
    AgentScope,
    BrowserAuthorizationInput,
    DeviceAuthorizationInput,
    TokenPair,
} from './agent-access.types';

const AUTHORIZATION_LIFETIME_MS = 10 * 60 * 1000;
const ACCESS_LIFETIME_SECONDS = 10 * 60;
const GRANT_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AgentAccessService {
    constructor(
        @Inject(AGENT_ACCESS_REPOSITORY) private readonly repository: AgentAccessRepository,
        private readonly config: ConfigService,
    ) {}

    integrationConfig() {
        return {
            enabled: this.enabled(),
            mcpUrl: this.resource(),
            testedClients: ['ChatGPT', 'Codex'],
            grantLifetimeDays: 30,
        };
    }

    authorizationServerMetadata() {
        const issuer = this.issuer();
        return {
            issuer,
            authorization_response_iss_parameter_supported: true,
            authorization_endpoint: `${issuer}/oauth/authorize`,
            token_endpoint: `${issuer}/oauth/token`,
            revocation_endpoint: `${issuer}/oauth/revoke`,
            device_authorization_endpoint: `${issuer}/oauth/device_authorization`,
            client_id_metadata_document_supported: true,
            token_endpoint_auth_methods_supported: ['none'],
            code_challenge_methods_supported: ['S256'],
            grant_types_supported: [
                'authorization_code',
                'refresh_token',
                'urn:ietf:params:oauth:grant-type:device_code',
            ],
            response_types_supported: ['code'],
            scopes_supported: [...AGENT_SCOPES],
        };
    }

    protectedResourceMetadata() {
        return {
            resource: this.resource(),
            authorization_servers: [this.issuer()],
            scopes_supported: [...AGENT_SCOPES],
            resource_documentation: `${this.appOrigin()}/portfolio`,
        };
    }

    async beginBrowserAuthorization(input: BrowserAuthorizationInput): Promise<string> {
        this.requireEnabled();
        this.validateResource(input.resource);
        const clientName = this.validateClient(input.clientId, input.redirectUri);
        if (!/^[A-Za-z0-9_-]{43,128}$/.test(input.codeChallenge))
            throw this.oauthError('invalid_request', 'Invalid PKCE challenge');
        const scopes = this.validateScopes(input.scopes);
        const authorization = await this.repository.transaction(async (repository) => {
            const created = await repository.createAuthorization({
                clientId: input.clientId,
                clientName,
                redirectUri: input.redirectUri,
                state: input.state,
                resource: input.resource,
                scopes,
                codeChallenge: input.codeChallenge,
                status: 'pending',
                expiresAt: new Date(Date.now() + AUTHORIZATION_LIFETIME_MS),
            });
            await this.audit(repository, 'agent.authorization.requested', created, { flow: 'authorization_code' });
            return created;
        });
        return `${this.appOrigin()}/en/portfolio/agent/authorize?transaction=${encodeURIComponent(authorization.id)}`;
    }

    async beginDeviceAuthorization(input: DeviceAuthorizationInput) {
        this.requireEnabled();
        this.validateResource(input.resource);
        const clientName = this.validateDeviceClient(input.clientId);
        const deviceCode = this.secret();
        const userCode = this.userCode();
        const scopes = this.validateScopes(input.scopes);
        await this.repository.transaction(async (repository) => {
            const authorization = await repository.createAuthorization({
                clientId: input.clientId,
                clientName,
                resource: input.resource,
                scopes,
                deviceCodeHash: this.hash(deviceCode),
                userCode,
                status: 'pending',
                expiresAt: new Date(Date.now() + AUTHORIZATION_LIFETIME_MS),
            });
            await this.audit(repository, 'agent.authorization.requested', authorization, { flow: 'device_code' });
        });
        return {
            device_code: deviceCode,
            user_code: userCode,
            verification_uri: `${this.appOrigin()}/en/portfolio`,
            verification_uri_complete: `${this.appOrigin()}/en/portfolio?connect=device`,
            expires_in: AUTHORIZATION_LIFETIME_MS / 1000,
            interval: 5,
        };
    }

    async authorizationForUser(id: string, userId: string) {
        this.requireEnabled();
        const authorization = await this.pendingAuthorization(id);
        if (authorization.userId && authorization.userId !== userId) throw new ForbiddenException();
        return this.toAuthorizationResponse(authorization);
    }

    async authorizationForDeviceCode(userCode: string, userId: string) {
        this.requireEnabled();
        const normalized = userCode
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .replace(/^(.{4})(.{4})$/, '$1-$2');
        return this.repository.transaction(async (repository) => {
            const authorization = await repository.authorizationByUserCode(normalized, true);
            if (!authorization) throw new NotFoundException('Device code is invalid or expired');
            const pending = await this.pendingAuthorization(authorization.id, repository, true);
            if (pending.userId && pending.userId !== userId) throw new ForbiddenException();
            if (!pending.userId) {
                pending.userId = userId;
                await repository.saveAuthorization(pending);
            }
            return this.toAuthorizationResponse(pending);
        });
    }

    async decide(id: string, userId: string, decision: 'approve' | 'deny'): Promise<string> {
        this.requireEnabled();
        const authorization = await this.repository.transaction(async (repository) => {
            const pending = await this.pendingAuthorization(id, repository, true);
            if (pending.userId && pending.userId !== userId) throw new ForbiddenException();
            pending.userId = userId;
            pending.status = decision === 'approve' ? 'approved' : 'denied';
            if (decision === 'approve') {
                const connection = await repository.createConnection({
                    userId,
                    clientId: pending.clientId,
                    clientName: pending.clientName,
                    scopes: pending.scopes,
                    status: 'active',
                    expiresAt: new Date(Date.now() + GRANT_LIFETIME_MS),
                });
                pending.connectionId = connection.id;
            }
            await repository.saveAuthorization(pending);
            await this.audit(
                repository,
                `agent.authorization.${decision === 'approve' ? 'approved' : 'denied'}`,
                pending,
            );
            return pending;
        });
        if (authorization.redirectUri) return `${this.issuer()}/oauth/complete?transaction=${authorization.id}`;
        return `${this.appOrigin()}/en/portfolio?agent=${decision === 'approve' ? 'connected' : 'denied'}`;
    }

    async completeBrowserAuthorization(id: string): Promise<string> {
        this.requireEnabled();
        return this.repository.transaction(async (repository) => {
            const authorization = await repository.authorizationById(id, true);
            if (!authorization?.redirectUri || !['approved', 'denied'].includes(authorization.status)) {
                throw this.oauthError('invalid_request', 'Authorization cannot be completed');
            }
            if (authorization.authorizationCodeHash)
                throw this.oauthError('invalid_request', 'Authorization was already completed');
            const redirect = new URL(authorization.redirectUri);
            if (authorization.status === 'denied') redirect.searchParams.set('error', 'access_denied');
            else {
                const code = this.secret();
                authorization.authorizationCodeHash = this.hash(code);
                await repository.saveAuthorization(authorization);
                redirect.searchParams.set('code', code);
            }
            if (authorization.state) redirect.searchParams.set('state', authorization.state);
            redirect.searchParams.set('iss', this.issuer());
            return redirect.toString();
        });
    }

    async exchangeAuthorizationCode(input: {
        code: string;
        clientId: string;
        redirectUri: string;
        verifier: string;
        resource: string;
    }): Promise<TokenPair> {
        this.requireEnabled();
        return this.repository.transaction(async (repository) => {
            const authorization = await repository.authorizationByCodeHash(this.hash(input.code), true);
            if (!authorization || authorization.status !== 'approved' || authorization.expiresAt <= new Date())
                throw this.oauthError('invalid_grant');
            if (
                authorization.clientId !== input.clientId ||
                authorization.redirectUri !== input.redirectUri ||
                authorization.resource !== input.resource
            )
                throw this.oauthError('invalid_grant');
            const challenge = createHash('sha256').update(input.verifier).digest('base64url');
            if (challenge !== authorization.codeChallenge) throw this.oauthError('invalid_grant');
            authorization.status = 'consumed';
            authorization.authorizationCodeHash = null;
            await repository.saveAuthorization(authorization);
            const tokens = await this.issueTokens(
                repository,
                authorization.connectionId,
                authorization.scopes,
                Boolean(authorization.scopes.includes('offline_access')),
            );
            await this.audit(repository, 'agent.authorization.exchanged', authorization, {
                flow: 'authorization_code',
            });
            return tokens;
        });
    }

    async exchangeDeviceCode(input: { deviceCode: string; clientId: string }): Promise<TokenPair> {
        this.requireEnabled();
        return this.repository.transaction(async (repository) => {
            const authorization = await repository.authorizationByDeviceHash(this.hash(input.deviceCode), true);
            if (!authorization || authorization.clientId !== input.clientId || authorization.expiresAt <= new Date())
                throw this.oauthError('expired_token');
            if (authorization.status === 'pending') throw this.oauthError('authorization_pending');
            if (authorization.status === 'denied') throw this.oauthError('access_denied');
            if (authorization.status !== 'approved') throw this.oauthError('invalid_grant');
            authorization.status = 'consumed';
            authorization.deviceCodeHash = null;
            await repository.saveAuthorization(authorization);
            const tokens = await this.issueTokens(
                repository,
                authorization.connectionId,
                authorization.scopes,
                Boolean(authorization.scopes.includes('offline_access')),
            );
            await this.audit(repository, 'agent.authorization.exchanged', authorization, { flow: 'device_code' });
            return tokens;
        });
    }

    async refresh(refreshToken: string, clientId: string): Promise<TokenPair> {
        this.requireEnabled();
        const result = await this.repository.transaction(async (repository) => {
            const credential = await repository.credentialByHash(this.hash(refreshToken), 'refresh', true);
            if (!credential) return { error: 'invalid' as const };
            const connection = await repository.connectionById(credential.connectionId, true);
            if (credential.usedAt || credential.revokedAt) {
                await repository.revokeFamily(credential.familyId);
                if (connection) {
                    await repository.createAuditEvent({
                        userId: connection.userId,
                        eventType: 'agent.token.refresh_reuse',
                        metadata: { connectionId: connection.id, clientId: connection.clientId },
                    });
                }
                return { error: 'reuse' as const };
            }
            if (
                !connection ||
                connection.clientId !== clientId ||
                connection.status !== 'active' ||
                connection.expiresAt <= new Date() ||
                credential.expiresAt <= new Date()
            )
                return { error: 'invalid' as const };
            credential.usedAt = new Date();
            await repository.saveCredential(credential);
            const tokens = await this.issueTokens(
                repository,
                connection.id,
                connection.scopes,
                true,
                credential.familyId,
                connection.expiresAt,
            );
            await repository.createAuditEvent({
                userId: connection.userId,
                eventType: 'agent.token.refreshed',
                metadata: { connectionId: connection.id, clientId: connection.clientId, scopes: connection.scopes },
            });
            return { tokens };
        });
        if ('tokens' in result) return result.tokens;
        if (result.error === 'reuse') throw this.oauthError('invalid_grant', 'Refresh token reuse detected');
        throw this.oauthError('invalid_grant');
    }

    async authenticateAccessToken(token: string, requiredScope?: AgentScope) {
        this.requireEnabled();
        return this.repository.transaction(async (repository) => {
            const credential = await repository.credentialByHash(this.hash(token), 'access');
            if (!credential || credential.revokedAt || credential.expiresAt <= new Date())
                throw new UnauthorizedException('Invalid agent access token');
            const connection = await repository.connectionById(credential.connectionId);
            if (!connection || connection.status !== 'active' || connection.expiresAt <= new Date())
                throw new UnauthorizedException('Agent connection expired or revoked');
            if (requiredScope && !connection.scopes.includes(requiredScope))
                throw new ForbiddenException('Required scope was not granted');
            connection.lastUsedAt = new Date();
            await repository.saveConnection(connection);
            await repository.createAuditEvent({
                userId: connection.userId,
                eventType: 'agent.mcp.access',
                metadata: {
                    connectionId: connection.id,
                    clientId: connection.clientId,
                    scope: requiredScope ?? null,
                },
            });
            return connection;
        });
    }

    async connectionsForUser(userId: string) {
        const connections = await this.repository.connectionsForUser(userId);
        const now = new Date();
        return connections.map((connection) => ({
            id: connection.id,
            clientName: connection.clientName,
            scopes: connection.scopes,
            status: connection.status === 'active' && connection.expiresAt <= now ? 'expired' : connection.status,
            createdAt: connection.createdAt.toISOString(),
            expiresAt: connection.expiresAt.toISOString(),
            lastUsedAt: connection.lastUsedAt?.toISOString() ?? null,
        }));
    }

    async revokeConnection(userId: string, id: string) {
        await this.repository.transaction(async (repository) => {
            const connection = await repository.connectionById(id, true);
            if (!connection || connection.userId !== userId) throw new NotFoundException('Agent connection not found');
            connection.status = 'revoked';
            await repository.saveConnection(connection);
            await repository.revokeConnectionCredentials(connection.id);
            await repository.createAuditEvent({
                userId,
                eventType: 'agent.connection.revoked',
                metadata: { connectionId: connection.id, clientId: connection.clientId, scopes: connection.scopes },
            });
        });
    }

    async revokeToken(token: string) {
        const hash = this.hash(token);
        await this.repository.transaction(async (repository) => {
            const credential =
                (await repository.credentialByHash(hash, 'refresh', true)) ??
                (await repository.credentialByHash(hash, 'access', true));
            if (!credential) return;
            const connection = await repository.connectionById(credential.connectionId, true);
            await repository.revokeConnectionCredentials(credential.connectionId);
            if (connection) {
                await repository.createAuditEvent({
                    userId: connection.userId,
                    eventType: 'agent.token.revoked',
                    metadata: { connectionId: connection.id, clientId: connection.clientId },
                });
            }
        });
    }

    private async issueTokens(
        repository: AgentAccessRepository,
        connectionId: string,
        scopes: string[],
        includeRefresh: boolean,
        familyId: string = randomUUID(),
        grantExpiry?: Date,
    ): Promise<TokenPair> {
        const accessToken = this.secret();
        await repository.createCredential({
            connectionId,
            kind: 'access',
            tokenHash: this.hash(accessToken),
            familyId,
            expiresAt: new Date(Date.now() + ACCESS_LIFETIME_SECONDS * 1000),
        });
        const result: TokenPair = {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: ACCESS_LIFETIME_SECONDS,
            scope: scopes.join(' '),
        };
        if (includeRefresh) {
            const refreshToken = this.secret();
            await repository.createCredential({
                connectionId,
                kind: 'refresh',
                tokenHash: this.hash(refreshToken),
                familyId,
                expiresAt: grantExpiry ?? new Date(Date.now() + GRANT_LIFETIME_MS),
            });
            result.refresh_token = refreshToken;
        }
        return result;
    }

    private async pendingAuthorization(
        id: string,
        repository: AgentAccessRepository = this.repository,
        forUpdate = false,
    ) {
        const authorization = await repository.authorizationById(id, forUpdate);
        if (!authorization || authorization.status !== 'pending' || authorization.expiresAt <= new Date())
            throw new NotFoundException('Authorization request is invalid or expired');
        return authorization;
    }

    private audit(
        repository: AgentAccessRepository,
        eventType: string,
        authorization: {
            id: string;
            userId?: string | null;
            clientId: string;
            scopes: string[];
            connectionId?: string | null;
        },
        metadata: Record<string, unknown> = {},
    ) {
        return repository.createAuditEvent({
            userId: authorization.userId ?? null,
            eventType,
            metadata: {
                authorizationId: authorization.id,
                connectionId: authorization.connectionId ?? null,
                clientId: authorization.clientId,
                scopes: authorization.scopes,
                ...metadata,
            },
        });
    }

    private toAuthorizationResponse(authorization: {
        id: string;
        clientName: string;
        scopes: string[];
        expiresAt: Date;
    }) {
        return {
            id: authorization.id,
            clientName: authorization.clientName,
            scopes: authorization.scopes,
            expiresAt: authorization.expiresAt.toISOString(),
        };
    }

    private validateScopes(scopes: string[]): AgentScope[] {
        const unique = [...new Set(scopes.filter(Boolean))];
        if (!unique.length || unique.some((scope) => !AGENT_SCOPES.includes(scope as AgentScope)))
            throw this.oauthError('invalid_scope');
        return unique as AgentScope[];
    }

    private validateClient(clientId: string, redirectUri: string): string {
        let client: URL;
        let redirect: URL;
        try {
            client = new URL(clientId);
            redirect = new URL(redirectUri);
        } catch {
            throw this.oauthError('invalid_client');
        }
        if (client.protocol !== 'https:' || redirect.protocol !== 'https:') throw this.oauthError('invalid_client');
        if (client.hostname === 'chatgpt.com') {
            const allowed =
                redirect.hostname === 'chatgpt.com' &&
                (redirect.pathname === '/connector_platform_oauth_redirect' ||
                    redirect.pathname.startsWith('/connector/oauth/'));
            if (!allowed) throw this.oauthError('invalid_redirect_uri');
            return 'ChatGPT / Codex';
        }
        if (client.origin !== redirect.origin) throw this.oauthError('invalid_redirect_uri');
        return client.hostname;
    }

    private validateDeviceClient(clientId: string): string {
        try {
            const client = new URL(clientId);
            if (client.protocol !== 'https:') throw new Error();
            return client.hostname === 'chatgpt.com' ? 'ChatGPT / Codex' : client.hostname;
        } catch {
            throw this.oauthError('invalid_client');
        }
    }

    private validateResource(resource: string) {
        if (resource !== this.resource()) throw this.oauthError('invalid_target');
    }
    private enabled() {
        return this.config.get<string>('AGENT_INTEGRATIONS_ENABLED') === 'true';
    }
    private requireEnabled() {
        if (!this.enabled()) throw new NotFoundException('Agent integrations are disabled');
    }
    private issuer() {
        return (this.config.get<string>('AGENT_PUBLIC_BASE_URL') || 'https://api.craftscript.com').replace(/\/$/, '');
    }
    private resource() {
        return `${this.issuer()}/mcp`;
    }
    private appOrigin() {
        return (this.config.get<string>('APP_PUBLIC_BASE_URL') || 'https://craftscript.com').replace(/\/$/, '');
    }
    private secret() {
        return randomBytes(32).toString('base64url');
    }
    private hash(value: string) {
        return createHash('sha256').update(value).digest('hex');
    }
    private userCode() {
        const raw = randomBytes(6)
            .toString('base64url')
            .replace(/[^A-Z0-9]/gi, '')
            .toUpperCase()
            .slice(0, 8)
            .padEnd(8, 'X');
        return `${raw.slice(0, 4)}-${raw.slice(4)}`;
    }
    private oauthError(error: string, description?: string) {
        return new BadRequestException({ error, ...(description ? { error_description: description } : {}) });
    }
}
