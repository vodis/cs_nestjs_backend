import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Keypair } from '@solana/web3.js';
import { BITCOIN_MAINNET, SOLANA_MAINNET } from '../assets/native-asset-routes';
import { AssetDto } from '../assets/dto/get-assets-response.dto';
import { BitcoinBalanceService } from './bitcoin-balance.service';
import { ChainBalanceService } from './chain-balance.service';
import { ChainRpcService } from './rpc/chain-rpc.service';
import { SolanaFundingService } from './solana-funding.service';
import { TonCenterService } from './ton/ton-center.service';

describe('PR 266 native funding balance identity', () => {
    const nativeBalance = jest.fn();
    const tokenBalance = jest.fn();
    const funds = jest.fn();
    const solanaAddress = Keypair.fromSeed(new Uint8Array(32).fill(1)).publicKey.toBase58();
    let service: ChainBalanceService;

    beforeEach(async () => {
        nativeBalance.mockReset().mockResolvedValue(1000000000n);
        tokenBalance.mockReset().mockResolvedValue('1250000');
        funds.mockReset().mockResolvedValue({ balance: 100000000n, feeRate: 1, reserve: 244n });
        const module = await Test.createTestingModule({
            providers: [
                ChainBalanceService,
                { provide: ConfigService, useValue: new ConfigService() },
                { provide: ChainRpcService, useValue: {} },
                { provide: TonCenterService, useValue: {} },
                { provide: SolanaFundingService, useValue: { nativeBalance, tokenBalance } },
                { provide: BitcoinBalanceService, useValue: { funds } },
            ],
        }).compile();
        service = module.get(ChainBalanceService);
    });

    it.each([
        ['sol', SOLANA_MAINNET, 'nep141:sol.omft.near', solanaAddress, 9],
        ['btc', BITCOIN_MAINNET, 'nep141:btc.omft.near', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 8],
        ['btc', BITCOIN_MAINNET, '1cs_v1:btc:native:coin', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 8],
    ] satisfies Array<[string, string, string, string, number]>)(
        'matches advertised native balance identity for %s / %s / %s',
        async (blockchain, network, assetId, address, decimals) => {
            const asset: AssetDto = {
                assetId,
                defuseAssetId: assetId,
                balanceAssetId: `${network}/native`,
                blockchain,
                symbol: blockchain.toUpperCase(),
                decimals,
            };
            const wallet = { address, chainType: blockchain };
            const ordinary = await service.getBalances(wallet, network, [undefined]);
            const review = await service.getBalances(wallet, network, [asset]);
            expect(review.failures).toEqual([]);
            expect(review.balances[0].assetId).toBe(asset.balanceAssetId);
            expect(review.balances[0].assetId).toBe(ordinary.balances[0].assetId);
            expect(review.balances[0].balanceRaw).toBe(ordinary.balances[0].balanceRaw);

            nativeBalance.mockRejectedValue(new Error('Provider unavailable'));
            funds.mockRejectedValue(new Error('Provider unavailable'));
            const failed = await service.getBalances(wallet, network, [asset]);
            expect(failed.failures).toEqual([{ assetId, reason: 'Provider unavailable' }]);
        },
    );

    it('preserves SPL token identity independently of native SOL', async () => {
        const asset: AssetDto = {
            assetId: 'provider:spl-usdc',
            defuseAssetId: 'provider:spl-usdc',
            blockchain: 'sol',
            symbol: 'USDC',
            decimals: 6,
            contractAddress: solanaAddress,
        };
        const result = await service.getBalances({ address: solanaAddress, chainType: 'solana' }, SOLANA_MAINNET, [
            asset,
        ]);
        expect(result.balances[0]).toMatchObject({ assetId: asset.assetId, balanceRaw: '1250000' });
        expect(tokenBalance).toHaveBeenCalledWith(solanaAddress, asset.contractAddress);
        expect(nativeBalance).not.toHaveBeenCalled();
    });
});
