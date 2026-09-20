export function formatTokenAmount(raw: string, decimals: number): string {
    if (!/^\d+$/.test(raw) || decimals < 0 || !Number.isInteger(decimals)) {
        return '0';
    }

    if (decimals === 0) {
        return raw.replace(/^0+(?=\d)/, '');
    }

    const padded = raw.padStart(decimals + 1, '0');
    const whole = padded.slice(0, -decimals).replace(/^0+(?=\d)/, '');
    const fraction = padded.slice(-decimals).replace(/0+$/, '');

    return fraction ? `${whole}.${fraction}` : whole;
}

export type AtomicDecimalScale = {
    multiplier: bigint;
    divisor: bigint;
};

const MAX_TOKEN_DECIMALS = 255;

export function getAtomicDecimalScale(sourceDecimals: number, destinationDecimals: number): AtomicDecimalScale {
    assertValidDecimals(sourceDecimals);
    assertValidDecimals(destinationDecimals);

    const difference = destinationDecimals - sourceDecimals;

    return difference >= 0
        ? { multiplier: 10n ** BigInt(difference), divisor: 1n }
        : { multiplier: 1n, divisor: 10n ** BigInt(-difference) };
}

function assertValidDecimals(decimals: number): void {
    if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > MAX_TOKEN_DECIMALS) {
        throw new RangeError(`Token decimals must be an integer between 0 and ${MAX_TOKEN_DECIMALS}`);
    }
}
