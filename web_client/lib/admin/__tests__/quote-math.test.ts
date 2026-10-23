import type { QuoteItem } from '@/types/quote';

import {
  computeTotals,
  emptyManualItem,
  isChangedLine,
  itemsEqual,
  lineTotal,
  nextManualSku,
  validateItems,
} from '../quote-math';

function item(overrides: Partial<QuoteItem> = {}): QuoteItem {
  return {
    sku: 'PIT-001',
    description: 'Pittura pareti',
    unit: 'mq',
    qty: 10,
    unit_price: 12.5,
    total: 125,
    manual_override: false,
    ...overrides,
  };
}

describe('totals', () => {
  it('rounds each line and the VAT to cents, like the backend', () => {
    expect(lineTotal({ qty: 3, unit_price: 0.335 })).toBe(1.01);
    const totals = computeTotals([item(), item({ qty: 2, unit_price: 33.33 })], 0.22);
    expect(totals).toEqual({ subtotal: 191.66, vatAmount: 42.17, grandTotal: 233.83 });
  });

  it('gives the cents the backend saves (contracts/money/golden_vectors.json)', () => {
    expect(lineTotal({ qty: 0.5, unit_price: 22.25 })).toBe(11.13);
    expect(lineTotal({ qty: 1, unit_price: 1.005 })).toBe(1.01);
    // 301.25 × 101.46 = 30564.825 exactly, but 30564.824999999997 as a float product:
    // rounding the float (even with Number.EPSILON) gave 30564.82, the backend 30564.83.
    expect(lineTotal({ qty: 301.25, unit_price: 101.46 })).toBe(30564.83);
    expect(computeTotals([item({ qty: 301.25, unit_price: 101.46 }), item({ qty: 0.5, unit_price: 22.25 })], 0.1)).toEqual({
      subtotal: 30575.96,
      vatAmount: 3057.6,
      grandTotal: 33633.56,
    });
  });

  it('treats a half-typed number as zero instead of NaN', () => {
    expect(lineTotal({ qty: Number.NaN, unit_price: 5 })).toBe(0);
    expect(computeTotals([{ qty: Number.NaN, unit_price: 5 }], 0.22).grandTotal).toBe(0);
  });
});

describe('change detection', () => {
  it('ignores server-computed fields, sees edits and additions', () => {
    const saved = [item()];
    expect(itemsEqual([item({ total: 999, manual_override: true })], saved)).toBe(true);
    expect(itemsEqual([item({ qty: 11 })], saved)).toBe(false);
    expect(itemsEqual([item(), item()], saved)).toBe(false);
    expect(isChangedLine(item({ unit_price: 13 }), saved, 0)).toBe(true);
    expect(isChangedLine(item(), saved, 0)).toBe(false);
    expect(isChangedLine(item(), saved, 1)).toBe(true);
  });
});

describe('validation', () => {
  it('flags empty text and invalid numbers per line', () => {
    const errors = validateItems([item(), item({ description: '  ', qty: -1, unit_price: Number.NaN })]);
    expect(errors.has(0)).toBe(false);
    expect(errors.get(1)).toEqual({
      description: 'Descrizione obbligatoria',
      qty: 'Quantità non valida',
      unit_price: 'Prezzo non valido',
    });
  });
});

describe('manual lines', () => {
  it('picks the first free MANUALE-nnn sku', () => {
    expect(nextManualSku([])).toBe('MANUALE-001');
    expect(nextManualSku([{ sku: 'MANUALE-001' }, { sku: 'MANUALE-003' }])).toBe('MANUALE-002');
    expect(emptyManualItem([{ sku: 'MANUALE-001' }])).toMatchObject({ sku: 'MANUALE-002', qty: 1, unit_price: 0 });
  });
});
