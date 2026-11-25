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

    it.each([{}, { jetton_wallets: null }, { jetton_wallets: {} }])(
        'rejects malformed Jetton envelopes: %j',
        async (data) => {
            get.mockResolvedValueOnce({ data });
            await expect(service.getJettonBalance('ton:mainnet', 'EQ-owner', 'EQ-master')).rejects.toThrow(
                'Invalid Jetton wallets response',
            );
        },
    );

    it('rejects malformed provider amounts', async () => {
        get.mockResolvedValueOnce({ data: { ok: true, result: 1.5 } });
        await expect(service.getNativeBalance('ton:mainnet', 'EQ-owner')).rejects.toThrow('invalid native balance');
    });
    it('binds the resolved jetton wallet to its owner and master', async () => {
        const owner = `0:${'11'.repeat(32)}`;
        const jetton = `0:${'22'.repeat(32)}`;
        const address = `0:${'33'.repeat(32)}`;
        get.mockResolvedValueOnce({ data: { jetton_wallets: [{ address, owner, jetton }] } });
        await expect(service.getJettonWalletAddress('ton:mainnet', owner, jetton)).resolves.toBe(address);
        get.mockResolvedValueOnce({ data: { jetton_wallets: [{ address, owner: address, jetton }] } });
        await expect(service.getJettonWalletAddress('ton:mainnet', owner, jetton)).rejects.toThrow('different jetton');
        get.mockResolvedValueOnce({ data: { jetton_wallets: [] } });
        await expect(service.getJettonWalletAddress('ton:mainnet', owner, jetton)).rejects.toThrow('No funded');
    });
});

it.each(['https://gateway.example', 'https://toncenter.com'])(
    'uses centralized TON root %s for balances and keeps ownership and funding lookups on Toncenter',
    async (root) => {
        const get = jest.fn().mockResolvedValue({ data: { ok: true, result: '1' } });
        const post = jest
            .fn()
            .mockResolvedValue({ data: { ok: true, result: { exit_code: 0, stack: [['num', '0x01']] } } });
        const service = new TonCenterService(
            { axiosRef: { get, post } } as unknown as HttpService,
            new ConfigService({
                TONCENTER_API_KEY: 'private-key',
                CHAIN_RPC_ENDPOINTS_JSON: JSON.stringify({ 'ton:mainnet': [{ alias: 'ton', url: root }] }),
            }),
        );
        await expect(service.getNativeBalance('ton:mainnet', 'owner')).resolves.toBe('1');
        await expect(service.getWalletPublicKey('owner')).resolves.toHaveLength(32);
        const owner = `0:${'11'.repeat(32)}`;
        const jetton = `0:${'22'.repeat(32)}`;
        const address = `0:${'33'.repeat(32)}`;
        get.mockResolvedValueOnce({ data: { jetton_wallets: [{ address, owner, jetton }] } });
        await expect(service.getJettonWalletAddress('ton:mainnet', owner, jetton)).resolves.toBe(address);
        const headers = root === 'https://toncenter.com' ? { 'X-API-Key': 'private-key' } : undefined;
        expect(get).toHaveBeenCalledWith(
            root + '/api/v2/getAddressBalance',
            expect.objectContaining({ headers, maxRedirects: 0 }),
        );
        expect(post).toHaveBeenCalledWith(
            'https://toncenter.com/api/v2/runGetMethod',
            { address: 'owner', method: 'get_public_key', stack: [] },
            expect.objectContaining({ headers: { 'X-API-Key': 'private-key' }, maxRedirects: 0 }),
        );
        expect(get).toHaveBeenCalledWith(
            'https://toncenter.com/api/v3/jetton/wallets',
            expect.objectContaining({ headers: { 'X-API-Key': 'private-key' }, maxRedirects: 0 }),
        );
    },
);
