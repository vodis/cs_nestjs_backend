import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ChainBalanceService } from './chain-balance.service';
import { ChainRpcService } from './rpc/chain-rpc.service';
import { TonCenterService } from './ton/ton-center.service';
import { AssetDto } from '../assets/dto/get-assets-response.dto';

const eth: AssetDto = {
    assetId: 'catalog:eth',
    defuseAssetId: 'nep141:eth.omft.near',
    blockchain: 'eth',
    symbol: 'ETH',
    decimals: 18,
};
const account = { address: '0x1111111111111111111111111111111111111111', chainType: 'ethereum' };

describe('Explicit native token selection', () => {
    let service: ChainBalanceService;
    const rpc: jest.Mocked<Pick<ChainRpcService, 'requestBatch'>> = { requestBatch: jest.fn() };
    const ton: jest.Mocked<Pick<TonCenterService, 'getNativeBalance' | 'getJettonBalance'>> = {
        getNativeBalance: jest.fn(),
        getJettonBalance: jest.fn(),
    };
    beforeEach(async () => {
        jest.resetAllMocks();
        const module = await Test.createTestingModule({
            providers: [
                ChainBalanceService,
                { provide: ChainRpcService, useValue: rpc },
                { provide: ConfigService, useValue: new ConfigService() },
                { provide: TonCenterService, useValue: ton },
            ],
        }).compile();
        service = module.get(ChainBalanceService);
        rpc.requestBatch.mockImplementation(async (_network, requests) => ({
            providerAlias: 'test',
            items: requests.map((request) => ({ key: request.key, result: '0x2a' })),
        }));
    });
    it('reads native ETH beside an ERC-20 and returns canonical native identity', async () => {
        const token = {
            ...eth,
            assetId: 'catalog:wrapped',
            defuseAssetId: 'wrapped',
            contractAddress: '0x2222222222222222222222222222222222222222',
        };
        const result = await service.getBalances(account, 'eip155:1', [eth, token]);
        expect(result.balances.map((row) => row.assetId)).toEqual(['eip155:1/native', token.assetId]);
        expect(rpc.requestBatch).toHaveBeenCalledWith('eip155:1', [
            expect.objectContaining({ key: eth.assetId, method: 'eth_getBalance' }),
            expect.objectContaining({ key: token.assetId, method: 'eth_call' }),
        ]);
    });
    it('retains requested identity on failure so stale fallback can match it', async () => {
        rpc.requestBatch.mockResolvedValue({
            providerAlias: 'test',
            items: [{ key: eth.assetId, error: 'unavailable' }],
        });
        const result = await service.getBalances(account, 'eip155:1', [eth]);
        expect(result.balances).toEqual([]);
        expect(result.failures).toEqual([expect.objectContaining({ assetId: eth.assetId })]);
    });
    it('does not infer native from missing contract or accept a route from another network', async () => {
        await expect(service.getBalances(account, 'eip155:1', [{ ...eth, defuseAssetId: 'unknown' }])).rejects.toThrow(
            'contract address',
        );
        await expect(service.getBalances(account, 'eip155:56', [eth])).rejects.toThrow();
        expect(rpc.requestBatch).not.toHaveBeenCalled();
    });
    it('reads explicit native TON without a Jetton lookup', async () => {
        ton.getNativeBalance.mockResolvedValue('42');
        const result = await service.getBalances({ address: `EQ${'a'.repeat(46)}`, chainType: 'ton' }, 'ton:mainnet', [
            {
                ...eth,
                assetId: 'catalog:ton',
                defuseAssetId: 'nep245:v2_1.omni.hot.tg:1117_',
                blockchain: 'ton',
                symbol: 'TON',
                decimals: 9,
            },
        ]);
        expect(result.balances).toEqual([expect.objectContaining({ assetId: 'ton:native', balanceRaw: '42' })]);
        expect(ton.getJettonBalance).not.toHaveBeenCalled();
    });
});
