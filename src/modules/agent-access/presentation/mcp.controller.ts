import { BadRequestException, Body, Controller, Get, Post, Req, Res, VERSION_NEUTRAL } from '@nestjs/common';
import type { Request, Response } from 'express';
import { GetPortfolioUseCase } from '../../portfolio/application/get-portfolio.use-case';
import { ManagePreferencesUseCase } from '../../portfolio/application/manage-preferences.use-case';
import { AgentAccessService } from '../application/agent-access.service';
import { AgentScope } from '../application/agent-access.types';

type McpRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: { name?: string } };

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
                return response.json(this.ok(body.id, await this.callTool(token, body.params?.name)));
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

    private async callTool(token: string, name?: string) {
        const scope: AgentScope = name === 'get_portfolio_snapshot' ? 'portfolio:read' : 'investment_profile:read';
        const connection = await this.agents.authenticateAccessToken(token, scope);
        let data: unknown;
        if (name === 'get_portfolio_snapshot') data = await this.portfolio.execute(connection.userId);
        else if (name === 'get_investment_profile') data = await this.preferences.get(connection.userId);
        else throw new BadRequestException('Unknown tool');
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
        const metadataUrl = this.agents
            .integrationConfig()
            .mcpUrl.replace('/mcp', '/.well-known/oauth-protected-resource');
        response.setHeader(
            'WWW-Authenticate',
            `Bearer resource_metadata="${metadataUrl}", scope="portfolio:read investment_profile:read"`,
        );
        return response.status(401).json({ error: 'unauthorized' });
    }
    private ok(id: McpRequest['id'], result: unknown) {
        return { jsonrpc: '2.0', id: id ?? null, result };
    }
    private failure(id: McpRequest['id'], code: number, message: string) {
        return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
    }
}
