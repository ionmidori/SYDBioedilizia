import { readFileSync } from 'fs';
import path from 'path';

import { computeTotals, formatCents, lineTotal, toCents, vatAmount } from '../money';

/**
 * contracts/money/golden_vectors.json — the same cases the backend checks
 * (backend_python/tests/unit/test_money_golden.py, src/core/money.py), so the
 * admin preview shows the cents the saved quote and the PDF will have.
 */
interface Vectors {
  to_cents: { value: number; expected: string }[];
  line_total: { qty: number; unit_price: number; expected: string }[];
  vat_amount: { subtotal: number; vat_rate: number; expected: string }[];
  compute_totals: {
    items: { qty: number; unit_price: number }[];
    vat_rate: number;
    expected: { lines: string[]; subtotal: string; vat_amount: string; grand_total: string };
  }[];
}

const vectors: Vectors = JSON.parse(
  readFileSync(path.join(__dirname, '../../../contracts/money/golden_vectors.json'), 'utf8'),
);

describe('money golden vectors (shared with the backend)', () => {
  it.each(vectors.to_cents)('toCents($value) = $expected', ({ value, expected }) => {
    expect(formatCents(toCents(value))).toBe(expected);
  });

  it.each(vectors.line_total)('$qty × $unit_price = $expected', ({ qty, unit_price, expected }) => {
    expect(formatCents(lineTotal(qty, unit_price))).toBe(expected);
  });

  it.each(vectors.vat_amount)('VAT of $subtotal at $vat_rate = $expected', ({ subtotal, vat_rate, expected }) => {
    expect(formatCents(vatAmount(toCents(subtotal), vat_rate))).toBe(expected);
  });

  it.each(vectors.compute_totals.map((c, i) => ({ ...c, i })))('totals case $i', ({ items, vat_rate, expected }) => {
    const lines = items.map((item) => lineTotal(item.qty, item.unit_price));
    const totals = computeTotals(lines, vat_rate);
    expect(lines.map(formatCents)).toEqual(expected.lines);
    expect(formatCents(totals.subtotal)).toBe(expected.subtotal);
    expect(formatCents(totals.vatAmount)).toBe(expected.vat_amount);
    expect(formatCents(totals.grandTotal)).toBe(expected.grand_total);
  });

  it('covers every section with real data', () => {
    expect(vectors.line_total.length).toBeGreaterThan(200);
    expect(vectors.compute_totals.length).toBeGreaterThan(50);
  });
});
