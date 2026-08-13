import { formatTokenAmount } from './decimal.util';

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
