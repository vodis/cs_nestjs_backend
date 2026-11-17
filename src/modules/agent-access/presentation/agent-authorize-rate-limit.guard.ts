import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Response } from 'express';

const WINDOW_MS = 60_000;
const REQUEST_LIMIT = 120;

/** Process-wide admission limit: rotating client IDs or forwarded IP headers cannot bypass it. */
@Injectable()
export class AgentAuthorizeRateLimitGuard implements CanActivate {
    private timestamps: number[] = [];

    canActivate(context: ExecutionContext): boolean {
        const now = Date.now();
        this.timestamps = this.timestamps.filter((timestamp) => timestamp > now - WINDOW_MS);
        if (this.timestamps.length >= REQUEST_LIMIT) {
            const retryAfter = Math.ceil((this.timestamps[0] + WINDOW_MS - now) / 1000);
            context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(retryAfter));
            throw new HttpException({ error: 'temporarily_unavailable' }, HttpStatus.TOO_MANY_REQUESTS);
        }
        this.timestamps.push(now);
        return true;
    }
}
