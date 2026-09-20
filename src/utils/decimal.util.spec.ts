import { formatTokenAmount, getAtomicDecimalScale } from './decimal.util';

describe('formatTokenAmount', () => {
    it('formats raw integer token units using the provided decimals', () => {
        expect(formatTokenAmount('1250000000000000000000000', 24)).toBe('1.25');
        expect(formatTokenAmount('1000000', 6)).toBe('1');
        expect(formatTokenAmount('1', 6)).toBe('0.000001');
    });

    it('returns 0 for invalid raw amounts or decimals', () => {
        expect(formatTokenAmount('1.25', 24)).toBe('0');
        expect(formatTokenAmount('abc', 24)).toBe('0');
        expect(formatTokenAmount('1', -1)).toBe('0');
    });
});

describe('getAtomicDecimalScale', () => {
    it('returns a divisor when the destination has fewer decimals', () => {
        expect(getAtomicDecimalScale(24, 6)).toEqual({
            multiplier: 1n,
            divisor: 10n ** 18n,
        });
    });

    it('returns a multiplier when the destination has more decimals', () => {
        expect(getAtomicDecimalScale(6, 24)).toEqual({
            multiplier: 10n ** 18n,
            divisor: 1n,
        });
    });

    it('does not scale assets with matching decimals', () => {
        expect(getAtomicDecimalScale(6, 6)).toEqual({ multiplier: 1n, divisor: 1n });
    });

    it('rejects invalid token decimals', () => {
        expect(() => getAtomicDecimalScale(-1, 6)).toThrow(RangeError);
        expect(() => getAtomicDecimalScale(6, 1.5)).toThrow(RangeError);
        expect(() => getAtomicDecimalScale(6, 256)).toThrow(RangeError);
    });
});
