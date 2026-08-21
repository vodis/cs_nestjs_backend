function normalizedDecimal(value: string): string {
    const trimmed = value.trim();
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) return trimmed;
    return '0';
}

function scaledInteger(value: string, scale: number): bigint {
    const [whole, fraction = ''] = normalizedDecimal(value).split('.');
    const padded = `${fraction}${'0'.repeat(scale)}`.slice(0, scale);
    return BigInt(whole || '0') * 10n ** BigInt(scale) + BigInt(padded || '0');
}

export function multiplyToScale(left: string, right: string, scale = 6): bigint {
    const operandScale = 18;
    const product = scaledInteger(left, operandScale) * scaledInteger(right, operandScale);
    return product / 10n ** BigInt(operandScale * 2 - scale);
}

export function formatScaled(value: bigint, scale = 6): string {
    const base = 10n ** BigInt(scale);
    const whole = value / base;
    const fraction = (value % base).toString().padStart(scale, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function percentage(value: bigint, total: bigint): string | null {
    if (total <= 0n) return null;
    const hundredths = (value * 10000n) / total;
    return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, '0')}`;
}
