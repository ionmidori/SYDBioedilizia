import type { PriceBookItem } from '@/types/admin-price-book';

import {
  categoriesOf,
  diffCounts,
  emptyItem,
  filterRows,
  firstProblem,
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
  it('uses the Italian spreadsheet convention: semicolons and decimal commas', () => {
    const csv = toCsv([item({ unit_price: 25.5, tags: ['a', 'b'] })]);
    const [header, first] = csv.split('\n');
    expect(header.startsWith('sku;description;unit;unit_price')).toBe(true);
    expect(first).toBe('DEM-001;Demolizione tramezzi;mq;25,5;Demolizioni;;false;;;;;a|b');
  });

  it('quotes cells that contain separators, quotes or line breaks', () => {
    const [, first] = toCsv([item({ description: 'Voce; "speciale"\nsu due righe' })]).split('\n');
    expect(first).toContain('"Voce; ""speciale""');
  });

  it.each([
    ['=SUM(A1)'],
    ['+1+1'],
    ['@cmd'],
    ['-2+3'],
    ['  =SUM(A1)'], // blanks before the formula
    ['\t=SUM(A1)'], // a tab
    ['\r=SUM(A1)'], // a carriage return
  ])('neutralises a spreadsheet formula: %j', (text) => {
    const row = toCsv([item({ description: text })]).split('\n').slice(1).join('\n');
    expect(row).toContain(`'${text}`);
  });

  it('leaves ordinary text and plain numbers alone', () => {
    const row = toCsv([item({ description: 'Tinteggiatura -5%' })]).split('\n')[1];
    expect(row).not.toContain("'Tinteggiatura");
  });
});

describe('parseTags', () => {
  it('trims, drops empties and caps like the backend', () => {
    expect(parseTags(' a, b ,, c ')).toEqual(['a', 'b', 'c']);
    expect(parseTags('x'.repeat(50))[0]).toHaveLength(40);
    expect(parseTags(Array.from({ length: 30 }, (_, i) => `t${i}`).join(',')).length).toBe(20);
  });
});

describe('limits mirrored from the backend', () => {
  const messages = (overrides: Partial<PriceBookItem>) => validatePriceBook([item(overrides)]).rows.get(0) ?? {};

  it('flags text that the backend would reject as too long', () => {
    expect(messages({ description: 'x'.repeat(301) }).description).toMatch(/300/);
    expect(messages({ unit: 'x'.repeat(13) }).unit).toMatch(/12/);
    expect(messages({ category: 'x'.repeat(61) }).category).toMatch(/60/);
    expect(messages({ subcategory: 'x'.repeat(81) }).subcategory).toMatch(/80/);
    expect(messages({ tags: ['x'.repeat(41)] }).tags).toBeDefined();
    expect(messages({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }).tags).toBeDefined();
  });

  it('flags prices above the cap, e.g. typed as 1e7', () => {
    expect(messages({ unit_price: 1e7 }).unit_price).toMatch(/troppo alto/);
    expect(messages({ unit_price: 1_000_000 }).unit_price).toBeUndefined();
  });

  it('flags negative or unreadable optional numbers (NaN = text the browser could not read)', () => {
    const errors = messages({ min_qty: -5, max_qty: Number.NaN, range_min: -1, range_max: Number.NaN });
    expect(Object.keys(errors).sort()).toEqual(['max_qty', 'min_qty', 'range_max', 'range_min']);
    expect(messages({ min_qty: null, max_qty: null }).min_qty).toBeUndefined();
  });

  it('accepts exactly the boundary values', () => {
    expect(hasIssues(validatePriceBook([item({ description: 'x'.repeat(300), unit: 'x'.repeat(12), category: 'x'.repeat(60) })]))).toBe(false);
  });
});

describe('firstProblem', () => {
  it('finds the first bad row and whether the error is in the collapsed details', () => {
    const items = [item(), item({ sku: 'B-1', unit_price: -1 }), item({ sku: 'C-1', min_qty: -1 })];
    expect(firstProblem(validatePriceBook(items))).toEqual({ index: 1, inDetails: false });
    expect(firstProblem(validatePriceBook([item(), item({ sku: 'C-1', min_qty: -1 })]))).toEqual({ index: 1, inDetails: true });
    expect(firstProblem(validatePriceBook([item()]))).toBeNull();
  });
});
