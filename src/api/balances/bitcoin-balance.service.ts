import { HttpService } from '@nestjs/axios';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Bitcoin-family reads use Esplora; network identity is verified before every read. */
@Injectable()
export class BitcoinBalanceService {
    constructor(
        private readonly config: ConfigService,
        private readonly http: HttpService,
    ) {}

    private base(): string {
        const configured = this.config.get<string>('BITCOIN_ESPLORA_URL');
        if (!configured) throw new ServiceUnavailableException('Bitcoin funding is not configured');
        const url = new URL(configured);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
            throw new ServiceUnavailableException('Invalid Bitcoin data provider configuration');
        return configured.replace(/\/$/, '');
    }

    private async read<T>(base: string, path: string): Promise<T> {
        try {
            return (await this.http.axiosRef.get<T>(`${base}${path}`, { timeout: 6000, maxRedirects: 0 })).data;
        } catch {
            throw new ServiceUnavailableException('Bitcoin data provider is unavailable');
        }
    }

    async funds(address: string): Promise<{ balance: bigint; feeRate: number; reserve: bigint }> {
        const base = this.base();
        const genesis = await this.read<string>(base, '/block-height/0');
        if (genesis !== '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f')
            throw new ServiceUnavailableException('Bitcoin provider returned the wrong network');
        const [utxos, fees] = await Promise.all([
            this.read<Array<{ value: number; status: { confirmed: boolean } }>>(
                base,
                `/address/${encodeURIComponent(address)}/utxo`,
            ),
            this.read<Record<string, number>>(base, '/fee-estimates'),
        ]);
        if (
            !Array.isArray(utxos) ||
            utxos.some(
                (utxo) =>
                    !Number.isSafeInteger(utxo.value) || utxo.value < 0 || typeof utxo.status?.confirmed !== 'boolean',
            )
        )
            throw new ServiceUnavailableException('Invalid Bitcoin balance response');
        const feeRate = Math.ceil(fees['3']);
        if (!Number.isSafeInteger(feeRate) || feeRate < 1 || feeRate > 10000)
            throw new ServiceUnavailableException('Invalid Bitcoin fee estimate');
        const confirmed = utxos.filter((utxo) => utxo.status.confirmed);
        return {
            balance: confirmed.reduce((sum, utxo) => sum + BigInt(utxo.value), 0n),
            feeRate,
            // Conservative legacy input size; wallet performs final coin selection and fee review.
            reserve: BigInt(10 + confirmed.length * 148 + 2 * 43) * BigInt(feeRate),
        };
    }
}
