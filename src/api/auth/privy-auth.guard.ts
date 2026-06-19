import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PrivyAuthService } from './privy-auth.service';
import type { AuthenticatedUser } from './types';

type AuthenticatedRequest = Request & {
    user?: AuthenticatedUser;
    cookies?: Record<string, string>;
};

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
    constructor(private readonly authService: PrivyAuthService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const token = extractBearerToken(request.headers.authorization) || request.cookies?.['privy-token'];

        if (!token) {
            throw new UnauthorizedException('Missing Privy access token');
        }

        request.user = await this.authService.authenticateToken(token);
        return true;
    }
}
