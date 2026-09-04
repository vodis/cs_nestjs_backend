import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { TonCenterService } from './ton-center.service';

describe('TonCenterService', () => {
    const get = jest.fn();
    const service = new TonCenterService(
        { axiosRef: { get } } as unknown as HttpService,
        new ConfigService({ TONCENTER_API_KEY: 'server-key' }),
    );

    beforeEach(() => jest.clearAllMocks());

    it('reads native TON in nanotons without exposing the provider key in the URL', async () => {
        get.mockResolvedValueOnce({ data: { ok: true, result: '2500000000' } });

        await expect(service.getNativeBalance('ton:mainnet', 'EQ-owner')).resolves.toBe('2500000000');
        expect(get).toHaveBeenCalledWith(
            'https://toncenter.com/api/v2/getAddressBalance',
            expect.objectContaining({
                params: { address: 'EQ-owner' },
                headers: { 'X-API-Key': 'server-key' },
            }),
        );
    });

    it('selects the requested Jetton master and treats a missing wallet as zero', async () => {
        get.mockResolvedValueOnce({
            data: { jetton_wallets: [{ balance: '1250000', jetton: 'EQ-master', owner: 'EQ-owner' }] },
        });
        await expect(service.getJettonBalance('ton:mainnet', 'EQ-owner', 'EQ-master')).resolves.toBe('1250000');

        get.mockResolvedValueOnce({ data: { jetton_wallets: [] } });
        await expect(service.getJettonBalance('ton:mainnet', 'EQ-owner', 'EQ-other')).resolves.toBe('0');
    });

    it('rejects malformed provider amounts', async () => {
        get.mockResolvedValueOnce({ data: { ok: true, result: 1.5 } });
        await expect(service.getNativeBalance('ton:mainnet', 'EQ-owner')).rejects.toThrow('invalid native balance');
    });
});
