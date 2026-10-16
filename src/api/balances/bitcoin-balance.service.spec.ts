import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { BitcoinBalanceService } from './bitcoin-balance.service';

describe('Bitcoin balance and fee checks', () => {
    const get = jest.fn();
    let service: BitcoinBalanceService;
    let genesis: string;
    beforeEach(async () => {
        genesis = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
        get.mockReset().mockImplementation(async (url: string) => {
            if (url.endsWith('/block-height/0')) return { data: genesis };
            if (url.endsWith('/fee-estimates')) return { data: { '3': 2.5 } };
            return {
                data: [
                    { value: 100000, status: { confirmed: true } },
                    { value: 99999, status: { confirmed: false } },
                ],
            };
        });
        const module = await Test.createTestingModule({
            providers: [
                BitcoinBalanceService,
                { provide: ConfigService, useValue: { get: () => 'https://bitcoin.example/api' } },
                { provide: HttpService, useValue: { axiosRef: { get } } },
            ],
        }).compile();
        service = module.get(BitcoinBalanceService);
    });
    it('uses only confirmed funds and reserves coin-selection fees', async () => {
        expect(await service.funds('account')).toEqual({ balance: 100000n, feeRate: 3, reserve: 732n });
    });
    it('rejects the wrong network before reading balances', async () => {
        genesis = 'testnet';
        await expect(service.funds('account')).rejects.toThrow('wrong network');
        expect(get).toHaveBeenCalledTimes(1);
    });
});
