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
});
