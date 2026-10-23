import { centsToNumber, computeTotals, formatCents, lineTotal, sumAmounts, toCents } from '../money';

// The rounding cases are in money.golden.test.ts; these pin the API around them.
describe('money', () => {
  it('rejects what is not a finite number', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => toCents(bad)).toThrow(RangeError);
      expect(() => lineTotal(bad, 1)).toThrow(RangeError);
    }
  });

  it('reads exponent notation the way the number prints', () => {
    expect(formatCents(toCents(1e-7))).toBe('0.00');
    expect(formatCents(toCents(1.5e21))).toBe('1500000000000000000000.00');
    expect(formatCents(lineTotal(2e-3, 2.5e3))).toBe('5.00');
  });

  it('never returns a negative zero', () => {
    expect(formatCents(toCents(-0.004))).toBe('0.00');
    expect(formatCents(toCents(-0))).toBe('0.00');
  });

  it('converts cents to the closest number for display and JSON', () => {
    expect(centsToNumber(toCents(11.125))).toBe(11.13);
    expect(centsToNumber(toCents(-1.005))).toBe(-1.01);
    expect(centsToNumber(sumAmounts([]))).toBe(0);
  });

  it('adds line totals exactly', () => {
    const totals = computeTotals([toCents(0.1), toCents(0.2)], 0.22);
    expect(centsToNumber(totals.subtotal)).toBe(0.3);
    expect(centsToNumber(totals.grandTotal)).toBe(0.37);
  });
});
