import { HttpService } from '@nestjs/axios';
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor, Provider } from '@nestjs/common';
import { Observable } from 'rxjs';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Scope } from '@nestjs/common/interfaces/scope-options.interface';
import { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

interface AdaptAxiosRequestConfig extends InternalAxiosRequestConfig {
    metadata?: {
        startTime: Date;
    };
}
interface AdaptAxiosResponse extends AxiosResponse {
    config: AdaptAxiosRequestConfig;
}

@Injectable({ scope: Scope.REQUEST })
export class HttpServiceInterceptor implements NestInterceptor {
    constructor(private httpService: HttpService) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const ctx = context.switchToHttp();
        const headers = ctx.getRequest();
        const { axiosRef } = this.httpService;

        axiosRef.defaults.headers.common = {
            ...axiosRef.defaults.headers.common,
            'X-Request-Id': headers.id,
        };
        return next.handle().pipe();
    }
}

export const onHttpModuleInit = (httpService) => {
    const logger = new Logger('Axios');
    httpService.axiosRef.interceptors.request.use((config: AdaptAxiosRequestConfig) => {
        config.metadata = { startTime: new Date() };
        return config;
    });

    httpService.axiosRef.interceptors.response.use(
        (req: AdaptAxiosResponse) => {
            const url = requestUrl(req.config);
            const time = +new Date() - +req.config.metadata.startTime + 'ms';
            const status = req.status;
            const method = req.request.method;

            logger.log(`[${method}] ${url} duration: ${time} ms, statusCode: ${status}`);
            return req;
        },
        (err: unknown) => {
            const error = err as AxiosError;
            const config = error.config as AdaptAxiosRequestConfig | undefined;
            const url = requestUrl(config);
            const startedAt = config?.metadata?.startTime;
            const time = startedAt ? String(+new Date() - +startedAt) : 'unknown';
            const status = String(error.response?.status || 'unknown');
            const method = config?.method || 'unknown';

            logger.error(`[${method}] ${url} duration: ${time} ms, statusCode: ${status}`);
            return Promise.reject(err);
        },
    );
};

function requestUrl(config?: AdaptAxiosRequestConfig): string {
    if (!config?.url) {
        return 'unknown';
    }

    try {
        const url = new URL(config.url, config.baseURL);
        return `${url.origin}${url.pathname}`;
    } catch {
        return config.url.split(/[?#]/, 1)[0] || 'unknown';
    }
}

export const HttpServiceInterceptorProvider: Provider = {
    provide: APP_INTERCEPTOR,
    useClass: HttpServiceInterceptor,
};
