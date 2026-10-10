import { EVM_NETWORKS, NATIVE_ROUTES } from '../../../../api/assets/native-asset-routes';
import { Interface } from 'ethers';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Address } from '@ton/core';
import { ChainRpcService } from '../../../../api/balances/rpc/chain-rpc.service';
import { TonCenterService } from '../../../../api/balances/ton/ton-center.service';
import type { WalletFunding, WalletFundingPort } from '../../application/ports/wallet-funding.port';
import type { AssetRegistryEntry } from '../../domain/models/asset-registry-entry';
import type { SwapQuoteCommand } from '../../domain/models/swap-quote-request';
import type { SwapExecutionPackage } from '../../domain/models/swap-quote';
import { SwapAddressValidationService } from '../../domain/services/swap-address-validation.service';

@Injectable()
export class WalletFundingAdapter implements WalletFundingPort {
    constructor(
        private readonly rpc: ChainRpcService,
        private readonly ton: TonCenterService,
    ) {}

    /** Conservative native Max estimate; final preparation validates the actual transfer again. */
    async nativeMaximum(network: string, account: string): Promise<string> {
        let balance: bigint;
        let reserve: bigint;
        if (network === 'near:mainnet') {
            const [state, protocol, gas] = await Promise.all([
                this.rpc.request<{ amount: string; locked: string; storage_usage: number }>(network, 'query', {
                    request_type: 'view_account',
                    finality: 'final',
                    account_id: account,
                }),
                this.rpc.request<{ runtime_config: { storage_amount_per_byte: string } }>(
                    network,
                    'EXPERIMENTAL_protocol_config',
                    { finality: 'final' },
                ),
                this.rpc.request<{ gas_price: string }>(network, 'gas_price', [null]),
            ]);
            balance = BigInt(state.result.amount);
            const storage =
                BigInt(state.result.storage_usage) * BigInt(protocol.result.runtime_config.storage_amount_per_byte) -
                BigInt(state.result.locked);
            reserve = (storage > 0n ? storage : 0n) + BigInt(gas.result.gas_price) * 150_000_000_000_000n;
        } else if (network === 'ton:mainnet') {
            balance = BigInt(await this.ton.getNativeBalance(network, account));
            reserve = 20_000_000n;
        } else if (Object.values(EVM_NETWORKS).includes(network)) {
            const [state, price, gas] = await Promise.all([
                this.rpc.request<string>(network, 'eth_getBalance', [account, 'latest']),
                this.rpc.request<string>(network, 'eth_gasPrice', []),
                this.rpc.request<string>(network, 'eth_estimateGas', [{ from: account, to: account, value: '0x0' }]),
            ]);
            balance = BigInt(state.result);
            reserve = BigInt(price.result) * BigInt(gas.result) * 2n;
        } else throw new BadRequestException('Native Max is not supported on this network');
        return (balance > reserve ? balance - reserve : 0n).toString();
    }

    async prepare(
        command: SwapQuoteCommand,
        asset: AssetRegistryEntry,
        execution: SwapExecutionPackage,
    ): Promise<WalletFunding> {
        const network =
            asset.blockchain === 'near'
                ? 'near:mainnet'
                : asset.blockchain === 'ton'
                  ? 'ton:mainnet'
                  : EVM_NETWORKS[asset.blockchain];
        if (!network || (command.network && command.network !== network))
            throw new BadRequestException('Unsupported funding network');
        const auth = network.startsWith('near:') ? 'near' : network.startsWith('ton:') ? 'ton' : 'evm';
        if (command.authMethod !== auth) throw new BadRequestException('Funding network does not match the wallet');
        const nativeNear = command.sourceAssetId === 'near:native';
        if (
            nativeNear &&
            (asset.blockchain !== 'near' || asset.defuseAssetId.replace(/^1cs_v1:near:/, '') !== 'nep141:wrap.near')
        )
            throw new BadRequestException('Native NEAR must use the registered wrapped NEAR route');
        if (command.sourceAssetId && !nativeNear && command.sourceAssetId !== asset.assetId)
            throw new BadRequestException('Funding asset does not match the registered route');
        const destination = execution.payload.depositAddress;
        const depositMemo = execution.payload.depositMemo;
        if (typeof destination !== 'string' || !destination) throw new BadRequestException('Missing deposit address');
        new SwapAddressValidationService().assertExternalRecipient(destination, 'DESTINATION_CHAIN', asset.blockchain);
        if (depositMemo !== undefined && (typeof depositMemo !== 'string' || depositMemo.length > 256))
            throw new BadRequestException('Invalid deposit memo');
        if ((auth === 'evm' || nativeNear) && depositMemo)
            throw new BadRequestException('EVM memo funding is not supported');
        const tokenContract = asset.contractAddress;
        const nativeRoute = asset.defuseAssetId === NATIVE_ROUTES[asset.blockchain];
        if (auth === 'evm' && !tokenContract && !nativeRoute)
            throw new BadRequestException('Asset has no registered EVM transfer contract');
        if (auth === 'ton' && !tokenContract && !nativeRoute)
            throw new BadRequestException('Asset has no registered jetton contract');
        let kind: WalletFunding['kind'];
        if (auth === 'near') kind = nativeNear ? 'near-native' : 'near-token';
        else if (auth === 'ton') kind = tokenContract ? 'ton-token' : 'ton-native';
        else kind = tokenContract && !/^0x(?:0{40}|e{40})$/i.test(tokenContract) ? 'evm-token' : 'evm-native';
        const funding: WalletFunding = {
            version: '1.0.0',
            kind,
            network,
            assetId: command.sourceAssetId ?? asset.assetId,
            executionAssetId: asset.defuseAssetId,
            sender: command.signerId,
            destination,
            amount: command.amount,
            ...(typeof depositMemo === 'string' ? { depositMemo } : {}),
        };
        if (kind === 'near-token') {
            const contract = tokenContract || asset.defuseAssetId.replace(/^(?:1cs_v1:near:)?nep141:/, '');
            if (!/^[a-z0-9._-]{2,64}$/.test(contract)) throw new BadRequestException('Invalid NEP-141 contract');
            funding.tokenContract = contract;
            const storage: unknown = await this.nearView(contract, 'storage_balance_of', { account_id: destination });
            if (storage === null) {
                const bounds: unknown = await this.nearView(contract, 'storage_balance_bounds', {});
                if (
                    !bounds ||
                    typeof bounds !== 'object' ||
                    !('min' in bounds) ||
                    typeof bounds.min !== 'string' ||
                    !/^\d+$/.test(bounds.min)
                )
                    throw new BadRequestException('Invalid token storage requirements');
                funding.storageDeposit = bounds.min;
            }
        } else if (kind === 'evm-token') {
            if (!tokenContract || !/^0x[0-9a-f]{40}$/i.test(tokenContract))
                throw new BadRequestException('Invalid ERC-20 contract');
            funding.tokenContract = tokenContract;
        } else if (kind === 'ton-token') {
            if (!tokenContract) throw new BadRequestException('Missing jetton contract');
            funding.tokenContract = Address.parse(tokenContract).toRawString();
            funding.jettonWallet = await this.ton.getJettonWalletAddress(network, command.signerId, tokenContract);
        }
        await this.assertFunds(funding);
        return funding;
    }

    private async assertFunds(funding: WalletFunding): Promise<void> {
        const amount = BigInt(funding.amount);
        if (funding.kind.startsWith('evm-')) {
            const erc20 = new Interface([
                'function transfer(address,uint256)',
                'function balanceOf(address) view returns (uint256)',
            ]);
            const token = funding.kind === 'evm-token';
            if (token) {
                const balance = await this.rpc.request<string>(funding.network, 'eth_call', [
                    { to: funding.tokenContract, data: erc20.encodeFunctionData('balanceOf', [funding.sender]) },
                    'latest',
                ]);
                if (BigInt(balance.result) < amount) throw new BadRequestException('Insufficient token balance');
            }
            const tx = {
                from: funding.sender,
                to: token ? funding.tokenContract : funding.destination,
                value: token ? '0x0' : `0x${amount.toString(16)}`,
                ...(token ? { data: erc20.encodeFunctionData('transfer', [funding.destination, amount]) } : {}),
            };
            const [balance, gas, price] = await Promise.all([
                this.rpc.request<string>(funding.network, 'eth_getBalance', [funding.sender, 'latest']),
                this.rpc.request<string>(funding.network, 'eth_estimateGas', [tx]),
                this.rpc.request<string>(funding.network, 'eth_gasPrice', []),
            ]);
            if (BigInt(balance.result) < (token ? 0n : amount) + BigInt(gas.result) * BigInt(price.result))
                throw new BadRequestException('Insufficient native balance for transfer and network fees');
        } else if (funding.kind.startsWith('near-')) {
            if (funding.tokenContract) {
                const balance = await this.nearView(funding.tokenContract, 'ft_balance_of', {
                    account_id: funding.sender,
                });
                if (typeof balance !== 'string' || !/^\d+$/.test(balance) || BigInt(balance) < amount)
                    throw new BadRequestException('Insufficient token balance');
            }
            const [account, protocol, gas] = await Promise.all([
                this.rpc.request<{ amount: string; locked: string; storage_usage: number }>(funding.network, 'query', {
                    request_type: 'view_account',
                    finality: 'final',
                    account_id: funding.sender,
                }),
                this.rpc.request<{ runtime_config: { storage_amount_per_byte: string } }>(
                    funding.network,
                    'EXPERIMENTAL_protocol_config',
                    { finality: 'final' },
                ),
                this.rpc.request<{ gas_price: string }>(funding.network, 'gas_price', [null]),
            ]);
            const storage =
                BigInt(account.result.storage_usage) * BigInt(protocol.result.runtime_config.storage_amount_per_byte);
            const locked = BigInt(account.result.locked);
            const reserve = storage > locked ? storage - locked : 0n;
            const send = funding.kind === 'near-native' ? amount : 1n + BigInt(funding.storageDeposit ?? '0');
            const fee = BigInt(gas.result.gas_price) * 100_000_000_000_000n;
            if (BigInt(account.result.amount) < reserve + send + fee)
                throw new BadRequestException('Insufficient NEAR for transfer, storage and network fees');
        } else {
            const balance = BigInt(await this.ton.getNativeBalance(funding.network, funding.sender));
            const token = funding.kind === 'ton-token';
            if (
                token &&
                funding.tokenContract &&
                BigInt(await this.ton.getJettonBalance(funding.network, funding.sender, funding.tokenContract)) < amount
            )
                throw new BadRequestException('Insufficient jetton balance');
            if (balance < (token ? 50_000_000n : amount) + 10_000_000n)
                throw new BadRequestException('Insufficient TON for transfer and network fees');
        }
    }

    private async nearView(contract: string, method: string, args: object): Promise<unknown> {
        const { result } = await this.rpc.request<{ result: number[] }>('near:mainnet', 'query', {
            request_type: 'call_function',
            finality: 'final',
            account_id: contract,
            method_name: method,
            args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
        });
        return JSON.parse(Buffer.from(result.result).toString('utf8'));
    }
}
