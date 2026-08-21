import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AgentConnectionsController } from '../../modules/agent-access/presentation/agent-connections.controller';
import { PortfolioController } from '../../modules/portfolio/presentation/portfolio.controller';
import { PrivyAuthGuard } from './privy-auth.guard';

function context(request: Record<string, unknown>, bearerOnly: boolean): ExecutionContext {
    const handler = () => undefined;
    if (bearerOnly) Reflect.defineMetadata('privyBearerOnly', true, handler);
    return {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => handler,
        getClass: () => class TestController {},
    } as unknown as ExecutionContext;
}

describe('PrivyAuthGuard', () => {
    const user = { id: 'user-1', privyUserId: 'privy-1' };
    const auth = { authenticateToken: jest.fn().mockResolvedValue(user) };
    const guard = new PrivyAuthGuard(auth as never, new Reflector());

    beforeEach(() => jest.clearAllMocks());

    it('rejects cookie fallback on bearer-only mutations', async () => {
        const request = { headers: {}, cookies: { 'privy-token': 'cookie-token' } };
        await expect(guard.canActivate(context(request, true))).rejects.toBeInstanceOf(UnauthorizedException);
        expect(auth.authenticateToken).not.toHaveBeenCalled();
    });

    it('accepts bearer authentication on bearer-only mutations', async () => {
        const request: any = {
            headers: { authorization: 'Bearer access-token' },
            cookies: { 'privy-token': 'cookie-token' },
        };
        await expect(guard.canActivate(context(request, true))).resolves.toBe(true);
        expect(auth.authenticateToken).toHaveBeenCalledWith('access-token');
        expect(request.user).toBe(user);
    });

    it('preserves cookie authentication for read-only endpoints', async () => {
        const request: any = { headers: {}, cookies: { 'privy-token': 'cookie-token' } };
        await expect(guard.canActivate(context(request, false))).resolves.toBe(true);
        expect(auth.authenticateToken).toHaveBeenCalledWith('cookie-token');
    });

    it('marks every new agent and portfolio mutation as bearer-only', () => {
        const handlers = [
            AgentConnectionsController.prototype.revoke,
            AgentConnectionsController.prototype.deviceAuthorization,
            AgentConnectionsController.prototype.approve,
            AgentConnectionsController.prototype.deny,
            PortfolioController.prototype.putPreferences,
        ];
        expect(handlers.every((handler) => Reflect.getMetadata('privyBearerOnly', handler) === true)).toBe(true);
    });
});
