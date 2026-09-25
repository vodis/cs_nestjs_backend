import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { onHttpModuleInit } from './http-clients.interceptor';

describe('onHttpModuleInit', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('does not log provider response bodies that can contain secrets', async () => {
        const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        let rejectResponse!: (error: unknown) => Promise<never>;
        const httpService = {
            axiosRef: {
                interceptors: {
                    request: { use: jest.fn() },
                    response: {
                        use: jest.fn((_success, failure) => {
                            rejectResponse = failure;
                        }),
                    },
                },
            },
        } as unknown as HttpService;
        const secret = 'review-sentinel-provider-key';
        const error = {
            response: {
                status: 401,
                config: {
                    url: `/coins/markets?api_key=${secret}`,
                    baseURL: 'https://api.coingecko.com/api/v3',
                    method: 'get',
                    metadata: { startTime: new Date() },
                },
                data: { status: { error_message: `Invalid API key ${secret}` } },
            },
        };

        onHttpModuleInit(httpService);

        await expect(rejectResponse(error)).rejects.toBe(error);
        expect(errorLog).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(errorLog.mock.calls)).not.toContain(secret);
    });

    it('logs a transport error without assuming a response exists', async () => {
        const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        let rejectResponse!: (error: unknown) => Promise<never>;
        const httpService = {
            axiosRef: {
                interceptors: {
                    request: { use: jest.fn() },
                    response: {
                        use: jest.fn((_success, failure) => {
                            rejectResponse = failure;
                        }),
                    },
                },
            },
        } as unknown as HttpService;
        const error = { config: { method: 'get', url: '/coins/markets' } };

        onHttpModuleInit(httpService);

        await expect(rejectResponse(error)).rejects.toBe(error);
        expect(errorLog).toHaveBeenCalledWith('[get] /coins/markets duration: unknown ms, statusCode: unknown');
    });
});
