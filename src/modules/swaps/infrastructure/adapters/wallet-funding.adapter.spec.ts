import { Test } from '@nestjs/testing';
import { WalletFundingAdapter } from './wallet-funding.adapter';
import { ChainRpcService } from '../../../../api/balances/rpc/chain-rpc.service';
import { TonCenterService } from '../../../../api/balances/ton/ton-center.service';
import type { SwapQuoteCommand } from '../../domain/models/swap-quote-request';
import type { SwapExecutionPackage } from '../../domain/models/swap-quote';

const command: SwapQuoteCommand = {
    originAsset: 'nep141:usdc.near',
    sourceAssetId: 'nep141:usdc.near',
    destinationAsset: 'nep141:wrap.near',
    amount: '146146',
    network: 'near:mainnet',
    authMethod: 'near',
    signerId: 'alice.near',
    recipient: 'alice.near',
    recipientType: 'DESTINATION_CHAIN',
    depositType: 'ORIGIN_CHAIN',
    refundType: 'ORIGIN_CHAIN',
    swapType: 'EXACT_INPUT',
    slippageTolerance: 100,
    deadline: new Date(Date.now() + 600000).toISOString(),
};
const asset = {
    assetId: command.originAsset,
    defuseAssetId: command.originAsset,
    symbol: 'USDC',
    decimals: 6,
    blockchain: 'near',
    contractAddress: 'usdc.near',
};
const execution: SwapExecutionPackage = {
    providerId: 'one-click',
    mode: 'deposit_address',
    protocol: '1click',
    requiredAction: 'deposit',
    payload: { depositAddress: 'deposit.near' },
};

describe('wallet funding preparation', () => {
    let adapter: WalletFundingAdapter;
    let tokenBalance: string;
    let nativeBalance: string;
    const rpc = { request: jest.fn() };
    const ton = { getNativeBalance: jest.fn() };
    beforeEach(async () => {
        tokenBalance = '146146';
        nativeBalance = '10000000000000000000000000';
        rpc.request.mockImplementation(
            async (_network: string, method: string, args: { method_name?: string; request_type?: string }) => {
                let result: unknown;
                if (method === 'gas_price') result = { gas_price: '100000000' };
                else if (method === 'EXPERIMENTAL_protocol_config')
                    result = { runtime_config: { storage_amount_per_byte: '10000000000000000000' } };
                else if (args.request_type === 'view_account')
                    result = { amount: nativeBalance, locked: '0', storage_usage: 100 };
                else
                    result = {
                        result: [
                            ...Buffer.from(
                                JSON.stringify(
                                    args.method_name === 'ft_balance_of'
                                        ? tokenBalance
                                        : args.method_name === 'storage_balance_bounds'
                                          ? { min: '1250000000000000000000' }
                                          : null,
                                ),
                            ),
                        ],
                    };
                return { result, providerAlias: 'test' };
            },
        );
        const module = await Test.createTestingModule({
            providers: [
                WalletFundingAdapter,
                { provide: ChainRpcService, useValue: rpc },
                { provide: TonCenterService, useValue: ton },
            ],
        }).compile();
        adapter = module.get(WalletFundingAdapter);
    });
    it('subtracts storage and a gas buffer from native Max and clamps exhausted balances to zero', async () => {
        expect(await adapter.nativeMaximum('near:mainnet', 'alice.near')).toBe(
            (BigInt(nativeBalance) - 100n * 10000000000000000000n - 100000000n * 150000000000000n).toString(),
        );
        nativeBalance = '1';
        expect(await adapter.nativeMaximum('near:mainnet', 'alice.near')).toBe('0');
        await expect(adapter.nativeMaximum('unsupported:1', 'alice.near')).rejects.toThrow('not supported');
    });

    it('reserves twice the sampled EVM gas cost using atomic integers', async () => {
        rpc.request.mockImplementation(async (_network: string, method: string) => ({
            result: method === 'eth_getBalance' ? '0x10000000000000001' : method === 'eth_gasPrice' ? '0xa' : '0x5208',
        }));
        expect(await adapter.nativeMaximum('eip155:1', '0x123')).toBe(
            (0x10000000000000001n - 10n * 21000n * 2n).toString(),
        );
    });

    it('reserves TON fees and clamps a smaller native balance to zero', async () => {
        ton.getNativeBalance.mockResolvedValueOnce('100000000').mockResolvedValueOnce('10000000');
        expect(await adapter.nativeMaximum('ton:mainnet', 'wallet')).toBe('80000000');
        expect(await adapter.nativeMaximum('ton:mainnet', 'wallet')).toBe('0');
    });

    it('binds USDC atomics, token contract, network and required storage to the prepared deposit', async () => {
        await expect(adapter.prepare(command, asset, execution)).resolves.toMatchObject({
            kind: 'near-token',
            amount: '146146',
            tokenContract: 'usdc.near',
            destination: 'deposit.near',
            storageDeposit: '1250000000000000000000',
            sender: 'alice.near',
        });
    });
    it('rejects insufficient tokens or native fees before returning executable funding', async () => {
        tokenBalance = '146145';
        await expect(adapter.prepare(command, asset, execution)).rejects.toThrow('Insufficient token');
        tokenBalance = '146146';
        nativeBalance = '1';
        await expect(adapter.prepare(command, asset, execution)).rejects.toThrow('Insufficient NEAR');
    });
    it('rejects wallet/network and asset mismatches before private RPC', async () => {
        rpc.request.mockClear();
        await expect(adapter.prepare({ ...command, network: 'eip155:1' }, asset, execution)).rejects.toThrow('network');
        await expect(adapter.prepare({ ...command, sourceAssetId: 'near:native' }, asset, execution)).rejects.toThrow(
            'Native NEAR',
        );
        expect(rpc.request).not.toHaveBeenCalled();
    });
});

describe('EVM and TON funding boundaries', () => {
    const rpc = { request: jest.fn() };
    const ton = {
        getNativeBalance: jest.fn(),
        getJettonBalance: jest.fn(),
        getJettonWalletAddress: jest.fn(),
    };
    let adapter: WalletFundingAdapter;
    const sender = `0x${'11'.repeat(20)}`;
    const destination = `0x${'22'.repeat(20)}`;
    const contract = `0x${'33'.repeat(20)}`;
    const tonSender = `0:${'11'.repeat(32)}`;
    const tonDestination = `0:${'22'.repeat(32)}`;
    const tonContract = `0:${'33'.repeat(32)}`;
    const tonWallet = `0:${'44'.repeat(32)}`;
    function prepare(blockchain: 'eth' | 'ton', contractAddress?: string, route?: string) {
        const id = route ?? `token:${blockchain}`;
        return adapter.prepare(
            {
                ...command,
                signerId: blockchain === 'eth' ? sender : tonSender,
                authMethod: blockchain === 'eth' ? 'evm' : 'ton',
                network: blockchain === 'eth' ? 'eip155:1' : 'ton:mainnet',
                originAsset: id,
                sourceAssetId: id,
            },
            { ...asset, assetId: id, defuseAssetId: id, blockchain, contractAddress },
            { ...execution, payload: { depositAddress: blockchain === 'eth' ? destination : tonDestination } },
        );
    }
    beforeEach(async () => {
        jest.resetAllMocks();
        rpc.request.mockImplementation(async (_network: string, method: string) => ({
            result: method === 'eth_estimateGas' ? '0x5208' : method === 'eth_gasPrice' ? '0x1' : '0xffffffffff',
        }));
        ton.getNativeBalance.mockResolvedValue('1000000000');
        ton.getJettonBalance.mockResolvedValue('146146');
        ton.getJettonWalletAddress.mockResolvedValue(tonWallet);
        const module = await Test.createTestingModule({
            providers: [
                WalletFundingAdapter,
                { provide: ChainRpcService, useValue: rpc },
                { provide: TonCenterService, useValue: ton },
            ],
        }).compile();
        adapter = module.get(WalletFundingAdapter);
    });
    it('funds registered native ETH with exact value and estimates the same transaction', async () => {
        await expect(prepare('eth', undefined, 'nep141:eth.omft.near')).resolves.toMatchObject({
            kind: 'evm-native',
            amount: '146146',
        });
        expect(rpc.request).toHaveBeenCalledWith('eip155:1', 'eth_estimateGas', [
            { from: sender, to: destination, value: '0x23ae2' },
        ]);
    });
    it('funds ERC20 with the registered contract and no native principal', async () => {
        await expect(prepare('eth', contract)).resolves.toMatchObject({ kind: 'evm-token', tokenContract: contract });
        expect(rpc.request).toHaveBeenCalledWith('eip155:1', 'eth_estimateGas', [
            expect.objectContaining({ to: contract, value: '0x0', data: expect.stringMatching(/^0xa9059cbb/) }),
        ]);
    });
    it('rejects insufficient ERC20, insufficient native gas, and unavailable RPC', async () => {
        rpc.request.mockResolvedValueOnce({ result: '0x1' });
        await expect(prepare('eth', contract)).rejects.toThrow('Insufficient token');
        rpc.request.mockImplementation(async () => ({ result: '0x1' }));
        await expect(prepare('eth', undefined, 'nep141:eth.omft.near')).rejects.toThrow('Insufficient native');
        rpc.request.mockRejectedValue(new Error('RPC unavailable'));
        await expect(prepare('eth', contract)).rejects.toThrow('RPC unavailable');
    });
    it('never infers a native token from missing or malformed transfer metadata', async () => {
        await expect(prepare('eth')).rejects.toThrow('registered EVM');
        await expect(prepare('eth', 'broken')).rejects.toThrow('Invalid ERC');
        await expect(prepare('ton')).rejects.toThrow('registered jetton');
        expect(rpc.request).not.toHaveBeenCalled();
    });
    it('recognizes native TON by registry ID even when its display symbol differs', async () => {
        await expect(prepare('ton', undefined, 'nep245:v2_1.omni.hot.tg:1117_')).resolves.toMatchObject({
            kind: 'ton-native',
            destination: tonDestination,
        });
        expect(ton.getJettonWalletAddress).not.toHaveBeenCalled();
    });
    it('resolves the sender jetton wallet server-side and checks token and native fees', async () => {
        await expect(prepare('ton', tonContract)).resolves.toMatchObject({
            kind: 'ton-token',
            jettonWallet: tonWallet,
            tokenContract: tonContract,
        });
        expect(ton.getJettonWalletAddress).toHaveBeenCalledWith('ton:mainnet', tonSender, tonContract);
        ton.getJettonBalance.mockResolvedValueOnce('146145');
        await expect(prepare('ton', tonContract)).rejects.toThrow('Insufficient jetton');
        ton.getNativeBalance.mockResolvedValue('59999999');
        await expect(prepare('ton', tonContract)).rejects.toThrow('Insufficient TON');
        ton.getNativeBalance.mockResolvedValue('1');
        await expect(prepare('ton', undefined, 'nep245:v2_1.omni.hot.tg:1117_')).rejects.toThrow('Insufficient TON');
    });
});
