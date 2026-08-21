import { formatScaled, multiplyToScale, percentage } from './decimal-value';

describe('decimal-value', () => {
    it('values fractional token balances without floating point arithmetic', () => {
        const value = multiplyToScale('1.23456789', '123.45');
        expect(formatScaled(value)).toBe('152.407406');
    });

    it('calculates stable allocation percentages', () => {
        expect(percentage(25000000n, 100000000n)).toBe('25.00');
        expect(percentage(1n, 0n)).toBeNull();
    });
});
