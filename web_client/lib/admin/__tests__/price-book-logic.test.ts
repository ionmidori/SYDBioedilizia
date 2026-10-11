import type { PriceBookItem } from '@/types/admin-price-book';

import {
  categoriesOf,
  diffCounts,
  emptyItem,
  filterRows,
  hasIssues,
  itemsEqual,
  nextSku,
  parseTags,
  toCsv,
  validatePriceBook,
} from '../price-book-logic';

function item(overrides: Partial<PriceBookItem> = {}): PriceBookItem {
  return {
    sku: 'DEM-001',
    description: 'Demolizione tramezzi',
    unit: 'mq',
    unit_price: 25,
    category: 'Demolizioni',
    vat_agevolata: false,
    tags: [],
    ...overrides,
  };
}

describe('validatePriceBook', () => {
  it('accepts a good list', () => {
    expect(hasIssues(validatePriceBook([item(), item({ sku: 'DEM-002' })]))).toBe(false);
  });

  it('flags the same problems as the backend, per row', () => {
    const issues = validatePriceBook([
      item(),
      item({ sku: 'dem-001' }), // duplicate ignoring case
      item({ sku: 'con spazio', description: '  ', unit: '', category: '', unit_price: -1 }),
      item({ sku: 'RNG-001', min_qty: 5, max_qty: 1, range_min: 9, range_max: 3 }),
    ]);
    expect(issues.rows.get(0)).toBeUndefined();
    expect(issues.rows.get(1)).toEqual({ sku: 'SKU duplicato' });
    expect(Object.keys(issues.rows.get(2) ?? {}).sort()).toEqual(
      ['category', 'description', 'sku', 'unit', 'unit_price'].sort(),
    );
    expect(Object.keys(issues.rows.get(3) ?? {}).sort()).toEqual(['min_qty', 'range_min']);
  });

  it('treats a half-typed price as invalid, not as zero', () => {
    expect(validatePriceBook([item({ unit_price: Number.NaN })]).rows.get(0)?.unit_price).toBeDefined();
  });

  it('refuses an empty list', () => {
    expect(validatePriceBook([]).list).toEqual(['Il listino non può essere vuoto.']);
  });
});

describe('diff and equality', () => {
  it('counts added, removed and changed lines by SKU', () => {
    const before = [item(), item({ sku: 'A' }), item({ sku: 'B' })];
    const after = [item({ unit_price: 30 }), item({ sku: 'A' }), item({ sku: 'NEW' })];
    expect(diffCounts(before, after)).toEqual({ added: 1, removed: 1, changed: 1 });
  });

  it('does not see a change where only unset optional fields differ', () => {
    const bare = { sku: 'X', description: 'd', unit: 'mq', unit_price: 1, category: 'c' } as PriceBookItem;
    expect(itemsEqual([bare], [{ ...bare, tags: [], vat_agevolata: false, subcategory: null }])).toBe(true);
    expect(itemsEqual([bare], [{ ...bare, unit_price: 2 }])).toBe(false);
  });
});

describe('new lines', () => {
  it('picks the first free NUOVO-nnn sku, ignoring case', () => {
    expect(nextSku([])).toBe('NUOVO-001');
    expect(nextSku([{ sku: 'nuovo-001' }, { sku: 'NUOVO-003' }])).toBe('NUOVO-002');
    expect(emptyItem([item()])).toMatchObject({ sku: 'NUOVO-001', category: 'Demolizioni', unit_price: 0 });
  });
});

describe('filter', () => {
  const items = [
    item(),
    item({ sku: 'BAG-001', description: 'Sanitari sospesi', category: 'Bagno', tags: ['wc', 'sospeso'] }),
    item({ sku: 'BAG-002', description: 'Piatto doccia', category: 'Bagno' }),
  ];

  it('keeps the position in the full list, so edits hit the right line', () => {
    const rows = filterRows(items, '', 'Bagno');
    expect(rows.map((r) => r.index)).toEqual([1, 2]);
  });

  it('matches every word in sku, description, category or tags', () => {
    expect(filterRows(items, 'sanitari wc', '').map((r) => r.item.sku)).toEqual(['BAG-001']);
    expect(filterRows(items, 'bag-00', '').length).toBe(2);
    expect(filterRows(items, 'nulla', '')).toEqual([]);
  });

  it('lists categories once, sorted', () => {
    expect(categoriesOf(items)).toEqual(['Bagno', 'Demolizioni']);
  });
});

describe('csv export', () => {
  it('escapes quotes and separators, and neutralises spreadsheet formulas', () => {
    const csv = toCsv([item({ description: 'Voce, "speciale"', tags: ['a', 'b'] }), item({ sku: 'F-1', description: '=SUM(A1)' })]);
    const [header, first, second] = csv.split('\n');
    expect(header.startsWith('sku,description,unit,unit_price')).toBe(true);
    expect(first).toContain('"Voce, ""speciale"""');
    expect(first.endsWith('a|b')).toBe(true);
    expect(second).toContain("'=SUM(A1)");
  });
});

describe('parseTags', () => {
  it('trims, drops empties and caps like the backend', () => {
    expect(parseTags(' a, b ,, c ')).toEqual(['a', 'b', 'c']);
    expect(parseTags('x'.repeat(50))[0]).toHaveLength(40);
    expect(parseTags(Array.from({ length: 30 }, (_, i) => `t${i}`).join(',')).length).toBe(20);
  });
});
