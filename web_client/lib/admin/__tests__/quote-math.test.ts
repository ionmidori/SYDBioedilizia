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
