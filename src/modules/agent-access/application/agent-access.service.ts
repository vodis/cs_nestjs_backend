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
        const authorization = await this.repository.createAuthorization({
            clientId: input.clientId,
            clientName,
            redirectUri: input.redirectUri,
            state: input.state,
            resource: input.resource,
            scopes: this.validateScopes(input.scopes),
            codeChallenge: input.codeChallenge,
            status: 'pending',
            expiresAt: new Date(Date.now() + AUTHORIZATION_LIFETIME_MS),
        });
        return `${this.appOrigin()}/en/portfolio/agent/authorize?transaction=${encodeURIComponent(authorization.id)}`;
    }

    async beginDeviceAuthorization(input: DeviceAuthorizationInput) {
        this.requireEnabled();
        this.validateResource(input.resource);
        const clientName = this.validateDeviceClient(input.clientId);
        const deviceCode = this.secret();
        const userCode = this.userCode();
        await this.repository.createAuthorization({
            clientId: input.clientId,
            clientName,
            resource: input.resource,
            scopes: this.validateScopes(input.scopes),
            deviceCodeHash: this.hash(deviceCode),
            userCode,
            status: 'pending',
            expiresAt: new Date(Date.now() + AUTHORIZATION_LIFETIME_MS),
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
        if (!authorization.userId) {
            authorization.userId = userId;
            await this.repository.saveAuthorization(authorization);
        }
        return this.toAuthorizationResponse(authorization);
    }

    async authorizationForDeviceCode(userCode: string, userId: string) {
        this.requireEnabled();
        const normalized = userCode
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .replace(/^(.{4})(.{4})$/, '$1-$2');
        const authorization = await this.repository.authorizationByUserCode(normalized);
        if (!authorization) throw new NotFoundException('Device code is invalid or expired');
        const pending = await this.pendingAuthorization(authorization.id);
        if (pending.userId && pending.userId !== userId) throw new ForbiddenException();
        if (!pending.userId) {
            pending.userId = userId;
            await this.repository.saveAuthorization(pending);
        }
        return this.toAuthorizationResponse(pending);
    }

    async decide(id: string, userId: string, decision: 'approve' | 'deny'): Promise<string> {
        this.requireEnabled();
        const authorization = await this.pendingAuthorization(id);
        if (authorization.userId && authorization.userId !== userId) throw new ForbiddenException();
        authorization.userId = userId;
        authorization.status = decision === 'approve' ? 'approved' : 'denied';
        if (decision === 'approve') {
            const connection = await this.repository.createConnection({
                userId,
                clientId: authorization.clientId,
                clientName: authorization.clientName,
                scopes: authorization.scopes,
                status: 'active',
                expiresAt: new Date(Date.now() + GRANT_LIFETIME_MS),
            });
            authorization.connectionId = connection.id;
        }
        await this.repository.saveAuthorization(authorization);
        if (authorization.redirectUri) return `${this.issuer()}/oauth/complete?transaction=${authorization.id}`;
        return `${this.appOrigin()}/en/portfolio?agent=${decision === 'approve' ? 'connected' : 'denied'}`;
    }

    async completeBrowserAuthorization(id: string): Promise<string> {
        this.requireEnabled();
        const authorization = await this.repository.authorizationById(id);
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
            await this.repository.saveAuthorization(authorization);
            redirect.searchParams.set('code', code);
        }
        if (authorization.state) redirect.searchParams.set('state', authorization.state);
        redirect.searchParams.set('iss', this.issuer());
        return redirect.toString();
    }

    async exchangeAuthorizationCode(input: {
        code: string;
        clientId: string;
        redirectUri: string;
        verifier: string;
        resource: string;
    }): Promise<TokenPair> {
        this.requireEnabled();
        const authorization = await this.repository.authorizationByCodeHash(this.hash(input.code));
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
        await this.repository.saveAuthorization(authorization);
        return this.issueTokens(
            authorization.connectionId,
            authorization.scopes,
            Boolean(authorization.scopes.includes('offline_access')),
        );
    }

    async exchangeDeviceCode(input: { deviceCode: string; clientId: string }): Promise<TokenPair> {
        this.requireEnabled();
        const authorization = await this.repository.authorizationByDeviceHash(this.hash(input.deviceCode));
        if (!authorization || authorization.clientId !== input.clientId || authorization.expiresAt <= new Date())
            throw this.oauthError('expired_token');
        if (authorization.status === 'pending') throw this.oauthError('authorization_pending');
        if (authorization.status === 'denied') throw this.oauthError('access_denied');
        if (authorization.status !== 'approved') throw this.oauthError('invalid_grant');
        authorization.status = 'consumed';
        authorization.deviceCodeHash = null;
        await this.repository.saveAuthorization(authorization);
        return this.issueTokens(
            authorization.connectionId,
            authorization.scopes,
            Boolean(authorization.scopes.includes('offline_access')),
        );
    }

    async refresh(refreshToken: string, clientId: string): Promise<TokenPair> {
        this.requireEnabled();
        const credential = await this.repository.credentialByHash(this.hash(refreshToken), 'refresh');
        if (!credential) throw this.oauthError('invalid_grant');
        if (credential.usedAt || credential.revokedAt) {
            await this.repository.revokeFamily(credential.familyId);
            throw this.oauthError('invalid_grant', 'Refresh token reuse detected');
        }
        const connection = await this.repository.connectionById(credential.connectionId);
        if (
            !connection ||
            connection.clientId !== clientId ||
            connection.status !== 'active' ||
            connection.expiresAt <= new Date() ||
            credential.expiresAt <= new Date()
        )
            throw this.oauthError('invalid_grant');
        credential.usedAt = new Date();
        await credential.save();
        return this.issueTokens(connection.id, connection.scopes, true, credential.familyId, connection.expiresAt);
    }

    async authenticateAccessToken(token: string, requiredScope?: AgentScope) {
        this.requireEnabled();
        const credential = await this.repository.credentialByHash(this.hash(token), 'access');
        if (!credential || credential.revokedAt || credential.expiresAt <= new Date())
            throw new UnauthorizedException('Invalid agent access token');
        const connection = await this.repository.connectionById(credential.connectionId);
        if (!connection || connection.status !== 'active' || connection.expiresAt <= new Date())
            throw new UnauthorizedException('Agent connection expired or revoked');
        if (requiredScope && !connection.scopes.includes(requiredScope))
            throw new ForbiddenException('Required scope was not granted');
        connection.lastUsedAt = new Date();
        await this.repository.saveConnection(connection);
        return connection;
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
        const connection = await this.repository.connectionById(id);
        if (!connection || connection.userId !== userId) throw new NotFoundException('Agent connection not found');
        connection.status = 'revoked';
        await this.repository.saveConnection(connection);
        await this.repository.revokeConnectionCredentials(connection.id);
    }

    async revokeToken(token: string) {
        const hash = this.hash(token);
        const credential =
            (await this.repository.credentialByHash(hash, 'refresh')) ??
            (await this.repository.credentialByHash(hash, 'access'));
        if (credential) await this.repository.revokeConnectionCredentials(credential.connectionId);
    }

    private async issueTokens(
        connectionId: string,
        scopes: string[],
        includeRefresh: boolean,
        familyId: string = randomUUID(),
        grantExpiry?: Date,
    ): Promise<TokenPair> {
        const accessToken = this.secret();
        await this.repository.createCredential({
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
            await this.repository.createCredential({
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

    private async pendingAuthorization(id: string) {
        const authorization = await this.repository.authorizationById(id);
        if (!authorization || authorization.status !== 'pending' || authorization.expiresAt <= new Date())
            throw new NotFoundException('Authorization request is invalid or expired');
        return authorization;
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
