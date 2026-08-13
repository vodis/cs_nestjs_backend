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
