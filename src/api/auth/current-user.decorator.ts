import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './types';

type AuthenticatedRequest = Request & {
    user?: AuthenticatedUser;
};

export const CurrentUser = createParamDecorator(
    (_: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
        const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
        return request.user;
    },
);
