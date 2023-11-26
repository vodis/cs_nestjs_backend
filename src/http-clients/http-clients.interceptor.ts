import { HttpService } from '@nestjs/axios';
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor, Provider } from '@nestjs/common';
import { Observable } from 'rxjs';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Scope } from '@nestjs/common/interfaces/scope-options.interface';
import { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

interface AdaptAxiosRequestConfig extends InternalAxiosRequestConfig {
    metadata: {
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
            const url = new URL(req.config.url, req.config.baseURL).toString();
            const time = +new Date() - +req.config.metadata.startTime + 'ms';
            const status = req.status;
            const method = req.request.method;

            logger.log(`[${method}] ${url} duration: ${time} ms, statusCode: ${status}`);
            return req;
        },
        (err) => {
            const url = new URL(err.response.config.url, err.response.config.baseURL).toString();
            const time = +new Date() - +err.response.config.metadata.startTime + 'ms';
            const status = err.response.status;
            const method = err.response.request.method;

            logger.error(`[${method}] ${url} duration: ${time} ms, statusCode: ${status} %j:`, err.response.data);
            return Promise.reject(err);
        },
    );
};

export const HttpServiceInterceptorProvider: Provider = {
    provide: APP_INTERCEPTOR,
    useClass: HttpServiceInterceptor,
};
