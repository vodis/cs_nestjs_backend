import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { McpController } from './mcp.controller';

function response() {
    const value: any = {
        statusCode: 200,
        headers: {},
        body: undefined,
        setHeader: jest.fn((key, content) => (value.headers[key] = content)),
        status: jest.fn((status) => {
            value.statusCode = status;
            return value;
        }),
        json: jest.fn((body) => {
            value.body = body;
            return value;
        }),
        send: jest.fn((body) => {
            value.body = body;
            return value;
        }),
    };
    return value;
}

describe('McpController', () => {
    const agents = {
        integrationConfig: jest.fn(() => ({ mcpUrl: 'https://api.craftscript.test/mcp' })),
        authenticateAccessToken: jest.fn(),
    };
    const portfolio = { execute: jest.fn() };
    const preferences = { get: jest.fn() };
    let controller: McpController;

    beforeEach(() => {
        jest.clearAllMocks();
        agents.authenticateAccessToken.mockResolvedValue({ userId: 'grant-user' });
        portfolio.execute.mockResolvedValue({ positions: [] });
        preferences.get.mockResolvedValue({ objective: 'growth' });
        controller = new McpController(agents as never, portfolio as never, preferences as never);
    });

    it('returns protected-resource discovery without a bearer token', async () => {
        const res = response();
        await controller.handle({ headers: {} } as never, res, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
        expect(res.statusCode).toBe(401);
        expect(res.headers['WWW-Authenticate']).toContain('/.well-known/oauth-protected-resource');
    });

    it('derives portfolio identity from the grant rather than tool input', async () => {
        const res = response();
        await controller.handle({ headers: { authorization: 'Bearer opaque-token' } } as never, res, {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: { name: 'get_portfolio_snapshot', userId: 'attacker-user' } as never,
        });
        expect(agents.authenticateAccessToken).toHaveBeenCalledWith('opaque-token', 'portfolio:read');
        expect(portfolio.execute).toHaveBeenCalledTimes(1);
        expect(portfolio.execute).toHaveBeenCalledWith('grant-user');
        expect(JSON.stringify(res.body)).not.toContain('attacker-user');
    });

    it('publishes only the two read-only tools', async () => {
        const res = response();
        await controller.handle({ headers: { authorization: 'Bearer opaque-token' } } as never, res, {
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/list',
        });
        const names = res.body.result.tools.map((tool: { name: string }) => tool.name);
        expect(names).toEqual(['get_portfolio_snapshot', 'get_investment_profile']);
    });

    it('accepts the initialized notification without a JSON-RPC response', async () => {
        const res = response();
        await controller.handle({ headers: { authorization: 'Bearer opaque-token' } } as never, res, {
            jsonrpc: '2.0',
            method: 'notifications/initialized',
        });
        expect(res.statusCode).toBe(202);
        expect(res.send).toHaveBeenCalledWith();
        expect(res.json).not.toHaveBeenCalled();
    });

    it('rejects unknown tools as invalid params without demanding an unrelated scope', async () => {
        const res = response();
        await controller.handle({ headers: { authorization: 'Bearer opaque-token' } } as never, res, {
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/call',
            params: { name: 'transfer_funds' },
        });
        expect(agents.authenticateAccessToken).toHaveBeenCalledWith('opaque-token');
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ jsonrpc: '2.0', id: 4, error: { code: -32602, message: 'Unknown tool' } });
        expect(portfolio.execute).not.toHaveBeenCalled();
        expect(preferences.get).not.toHaveBeenCalled();
    });

    it('does not resolve tool names from the object prototype', async () => {
        const res = response();
        await controller.handle({ headers: { authorization: 'Bearer opaque-token' } } as never, res, {
            jsonrpc: '2.0',
            id: 5,
            method: 'tools/call',
            params: { name: 'constructor' },
        });
        expect(res.body.error.code).toBe(-32602);
    });

    it('still requires a valid token before reporting an unknown tool', async () => {
        agents.authenticateAccessToken.mockRejectedValueOnce(new UnauthorizedException());
        const res = response();
        await controller.handle({ headers: { authorization: 'Bearer revoked-token' } } as never, res, {
            jsonrpc: '2.0',
            id: 6,
            method: 'tools/call',
            params: { name: 'transfer_funds' },
        });
        expect(res.statusCode).toBe(401);
    });

    it('signals the missing scope so clients can step up authorization', async () => {
        agents.authenticateAccessToken.mockRejectedValueOnce(new ForbiddenException());
        const res = response();
        await controller.handle({ headers: { authorization: 'Bearer opaque-token' } } as never, res, {
            jsonrpc: '2.0',
            id: 7,
            method: 'tools/call',
            params: { name: 'get_investment_profile' },
        });
        expect(agents.authenticateAccessToken).toHaveBeenCalledWith('opaque-token', 'investment_profile:read');
        expect(res.statusCode).toBe(403);
        expect(res.headers['WWW-Authenticate']).toContain('error="insufficient_scope"');
        expect(res.headers['WWW-Authenticate']).toContain('scope="investment_profile:read"');
        expect(res.body.error.code).toBe(-32003);
        expect(preferences.get).not.toHaveBeenCalled();
    });

    it('returns method not allowed when the client requests an SSE stream', () => {
        const res = response();
        controller.stream(res);
        expect(res.statusCode).toBe(405);
    });
});
