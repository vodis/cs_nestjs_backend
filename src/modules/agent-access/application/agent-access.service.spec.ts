import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { AgentAccessService } from './agent-access.service';

function record<T extends object>(value: T): T & { save: jest.Mock } {
    return Object.assign(value, { save: jest.fn().mockResolvedValue(undefined) });
}

describe('AgentAccessService', () => {
    let authorizations: any[];
    let connections: any[];
    let credentials: any[];
    let revokedFamilies: string[];
    let service: AgentAccessService;

    beforeEach(() => {
        authorizations = [];
        connections = [];
        credentials = [];
        revokedFamilies = [];
        const repository = {
            createAuthorization: jest.fn(async (input) => {
                const item = record({ id: randomUUID(), createdAt: new Date(), ...input });
                authorizations.push(item);
                return item;
            }),
            authorizationById: jest.fn(async (id) => authorizations.find((item) => item.id === id) ?? null),
            authorizationByUserCode: jest.fn(
                async (code) => authorizations.find((item) => item.userCode === code) ?? null,
            ),
            authorizationByDeviceHash: jest.fn(
                async (hash) => authorizations.find((item) => item.deviceCodeHash === hash) ?? null,
            ),
            authorizationByCodeHash: jest.fn(
                async (hash) => authorizations.find((item) => item.authorizationCodeHash === hash) ?? null,
            ),
            saveAuthorization: jest.fn(async () => undefined),
            createConnection: jest.fn(async (input) => {
                const item = record({ id: randomUUID(), createdAt: new Date(), lastUsedAt: null, ...input });
                connections.push(item);
                return item;
            }),
            connectionById: jest.fn(async (id) => connections.find((item) => item.id === id) ?? null),
            connectionsForUser: jest.fn(async (userId) => connections.filter((item) => item.userId === userId)),
            saveConnection: jest.fn(async () => undefined),
            createCredential: jest.fn(async (input) => {
                const item = record({
                    id: randomUUID(),
                    createdAt: new Date(),
                    usedAt: null,
                    revokedAt: null,
                    ...input,
                });
                credentials.push(item);
                return item;
            }),
            credentialByHash: jest.fn(
                async (hash, kind) => credentials.find((item) => item.tokenHash === hash && item.kind === kind) ?? null,
            ),
            revokeFamily: jest.fn(async (familyId) => {
                revokedFamilies.push(familyId);
                credentials
                    .filter((item) => item.familyId === familyId)
                    .forEach((item) => (item.revokedAt = new Date()));
            }),
            revokeConnectionCredentials: jest.fn(async (connectionId) =>
                credentials
                    .filter((item) => item.connectionId === connectionId)
                    .forEach((item) => (item.revokedAt = new Date())),
            ),
        };
        const config = new ConfigService({
            AGENT_INTEGRATIONS_ENABLED: 'true',
            AGENT_PUBLIC_BASE_URL: 'https://api.craftscript.test',
            APP_PUBLIC_BASE_URL: 'https://craftscript.test',
        });
        service = new AgentAccessService(repository, config);
    });

    it('completes PKCE authorization once and stores only token hashes', async () => {
        const verifier = 'v'.repeat(43);
        const challenge = createHash('sha256').update(verifier).digest('base64url');
        const consentUrl = await service.beginBrowserAuthorization({
            clientId: 'https://chatgpt.com/oauth/client.json',
            redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect',
            state: 'client-state',
            resource: 'https://api.craftscript.test/mcp',
            scopes: ['portfolio:read', 'offline_access'],
            codeChallenge: challenge,
        });
        const authorization = authorizations[0];
        expect(consentUrl).toContain(authorization.id);

        await service.authorizationForUser(authorization.id, 'user-1');
        await expect(service.authorizationForUser(authorization.id, 'user-2')).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        const completion = await service.decide(authorization.id, 'user-1', 'approve');
        expect(completion).toBe(`https://api.craftscript.test/oauth/complete?transaction=${authorization.id}`);

        const callback = new URL(await service.completeBrowserAuthorization(authorization.id));
        const code = callback.searchParams.get('code');
        expect(code).toBeTruthy();
        await expect(service.completeBrowserAuthorization(authorization.id)).rejects.toBeInstanceOf(
            BadRequestException,
        );

        const tokens = await service.exchangeAuthorizationCode({
            code,
            clientId: 'https://chatgpt.com/oauth/client.json',
            redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect',
            verifier,
            resource: 'https://api.craftscript.test/mcp',
        });
        expect(tokens.refresh_token).toBeTruthy();
        expect(JSON.stringify(credentials)).not.toContain(tokens.access_token);
        expect(JSON.stringify(credentials)).not.toContain(tokens.refresh_token);
    });

    it('supports device authorization and rejects refresh-token reuse', async () => {
        const device = await service.beginDeviceAuthorization({
            clientId: 'https://agent.example/client.json',
            resource: 'https://api.craftscript.test/mcp',
            scopes: ['portfolio:read', 'offline_access'],
        });
        await expect(
            service.exchangeDeviceCode({
                deviceCode: device.device_code,
                clientId: 'https://agent.example/client.json',
            }),
        ).rejects.toMatchObject({ response: { error: 'authorization_pending' } });
        const request = await service.authorizationForDeviceCode(device.user_code, 'user-1');
        await service.decide(request.id, 'user-1', 'approve');
        const pair = await service.exchangeDeviceCode({
            deviceCode: device.device_code,
            clientId: 'https://agent.example/client.json',
        });
        const rotated = await service.refresh(pair.refresh_token, 'https://agent.example/client.json');
        expect(rotated.refresh_token).toBeTruthy();
        await expect(service.refresh(pair.refresh_token, 'https://agent.example/client.json')).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(revokedFamilies).toHaveLength(1);
    });

    it('rejects redirect URIs that are not owned by the client', async () => {
        await expect(
            service.beginBrowserAuthorization({
                clientId: 'https://agent.example/client.json',
                redirectUri: 'https://attacker.example/callback',
                resource: 'https://api.craftscript.test/mcp',
                scopes: ['portfolio:read'],
                codeChallenge: 'x'.repeat(43),
            }),
        ).rejects.toMatchObject({ response: { error: 'invalid_redirect_uri' } });
    });
});
