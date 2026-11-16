import { Body, Controller, Get, Post, Req, Res, VERSION_NEUTRAL } from '@nestjs/common';
import type { Request, Response } from 'express';
import { GetPortfolioUseCase } from '../../portfolio/application/get-portfolio.use-case';
import { ManagePreferencesUseCase } from '../../portfolio/application/manage-preferences.use-case';
import { AgentAccessService } from '../application/agent-access.service';
import { AgentScope } from '../application/agent-access.types';

type McpRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: { name?: string } };
type ToolName = 'get_portfolio_snapshot' | 'get_investment_profile';

const TOOL_SCOPES = new Map<string, AgentScope>([
    ['get_portfolio_snapshot', 'portfolio:read'],
    ['get_investment_profile', 'investment_profile:read'],
]);

@Controller({ version: VERSION_NEUTRAL, path: 'mcp' })
export class McpController {
    constructor(
        private readonly agents: AgentAccessService,
        private readonly portfolio: GetPortfolioUseCase,
        private readonly preferences: ManagePreferencesUseCase,
    ) {}

    @Get()
    stream(@Res() response: Response) {
        return response.status(405).send();
    }

    @Post()
    async handle(@Req() request: Request, @Res() response: Response, @Body() body: McpRequest) {
        const token = this.bearer(request.headers.authorization);
        if (!token) return this.unauthorized(response);
        let requiredScope: AgentScope | undefined;
        try {
            if (body.id === undefined && body.method?.startsWith('notifications/')) {
                await this.agents.authenticateAccessToken(token);
                return response.status(202).send();
            }
            if (body.method === 'initialize') {
                await this.agents.authenticateAccessToken(token);
                return response.json(
                    this.ok(body.id, {
                        protocolVersion: '2025-06-18',
                        capabilities: { tools: {} },
                        serverInfo: { name: 'CraftScript Portfolio', version: '1.0.0' },
                    }),
                );
            }
            if (body.method === 'tools/list') {
                await this.agents.authenticateAccessToken(token);
                return response.json(this.ok(body.id, { tools: this.tools() }));
            }
            if (body.method === 'tools/call') {
                const name = body.params?.name;
                requiredScope = typeof name === 'string' ? TOOL_SCOPES.get(name) : undefined;
                if (!requiredScope) {
                    await this.agents.authenticateAccessToken(token);
                    return response.json(this.failure(body.id, -32602, 'Unknown tool'));
                }
                return response.json(this.ok(body.id, await this.callTool(token, name as ToolName, requiredScope)));
            }
            if (body.method === 'ping') {
                await this.agents.authenticateAccessToken(token);
                return response.json(this.ok(body.id, {}));
            }
            return response.status(400).json(this.failure(body.id, -32601, 'Method not found'));
        } catch (error) {
            const status =
                typeof error === 'object' && error && 'getStatus' in error
                    ? Number((error as { getStatus(): number }).getStatus())
                    : 500;
            if (status === 401) return this.unauthorized(response);
            if (status === 403 && requiredScope) this.insufficientScope(response, requiredScope);
            return response
                .status(status)
                .json(
                    this.failure(
                        body.id,
                        status === 403 ? -32003 : -32603,
                        status === 403 ? 'Required scope was not granted' : 'Tool request failed',
                    ),
                );
        }
    }

    private async callTool(token: string, name: ToolName, scope: AgentScope) {
        const connection = await this.agents.authenticateAccessToken(token, scope);
        const data =
            name === 'get_portfolio_snapshot'
                ? await this.portfolio.execute(connection.userId)
                : await this.preferences.get(connection.userId);
        const safeData = {
            data,
            notice: 'Informational portfolio context only. Values may be stale or unpriced and cannot guarantee profit.',
        };
        return { content: [{ type: 'text', text: JSON.stringify(safeData) }], structuredContent: safeData };
    }

    private tools() {
        return [
            {
                name: 'get_portfolio_snapshot',
                title: 'Get portfolio snapshot',
                description:
                    'Returns the authenticated user’s read-only positions, USD estimates, allocations, and data ' +
                    'timestamps. Never executes transactions.',
                inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            },
            {
                name: 'get_investment_profile',
                title: 'Get investment preferences',
                description:
                    'Returns objective, risk tolerance, and time horizon. Does not expose email, wallet addresses, or login metadata.',
                inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            },
        ];
    }

    private bearer(value?: string) {
        const match = value?.match(/^Bearer\s+(.+)$/i);
        return match?.[1];
    }
    private unauthorized(response: Response) {
        response.setHeader(
            'WWW-Authenticate',
            `Bearer resource_metadata="${this.resourceMetadataUrl()}", scope="portfolio:read investment_profile:read"`,
        );
        return response.status(401).json({ error: 'unauthorized' });
    }
    private insufficientScope(response: Response, scope: AgentScope) {
        response.setHeader(
            'WWW-Authenticate',
            `Bearer error="insufficient_scope", scope="${scope}", resource_metadata="${this.resourceMetadataUrl()}"`,
        );
    }
    private resourceMetadataUrl() {
        return this.agents.integrationConfig().mcpUrl.replace('/mcp', '/.well-known/oauth-protected-resource');
    }
    private ok(id: McpRequest['id'], result: unknown) {
        return { jsonrpc: '2.0', id: id ?? null, result };
    }
    private failure(id: McpRequest['id'], code: number, message: string) {
        return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
    }
}
