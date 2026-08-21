import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrivyAuthService } from './privy-auth.service';
import type { AuthenticatedUser } from './types';

type AuthenticatedRequest = Request & {
    user?: AuthenticatedUser;
    cookies?: Record<string, string>;
};

const PRIVY_BEARER_ONLY = 'privyBearerOnly';

export const RequirePrivyBearer = () => SetMetadata(PRIVY_BEARER_ONLY, true);

function extractBearerToken(value?: string): string | undefined {
    if (!value) {
        return undefined;
    }
    const [scheme, token] = value.split(' ');
    if (scheme !== 'Bearer' || !token) {
        return undefined;
    }
    return token;
}

@Injectable()
export class PrivyAuthGuard implements CanActivate {
    constructor(
        private readonly authService: PrivyAuthService,
        private readonly reflector: Reflector,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const bearerToken = extractBearerToken(request.headers.authorization);
        const bearerOnly = this.reflector.getAllAndOverride<boolean>(PRIVY_BEARER_ONLY, [
            context.getHandler(),
            context.getClass(),
        ]);
        const token = bearerToken || (bearerOnly ? undefined : request.cookies?.['privy-token']);

        if (!token) {
            throw new UnauthorizedException('Missing Privy access token');
        }

        request.user = await this.authService.authenticateToken(token);
        return true;
    }
}
