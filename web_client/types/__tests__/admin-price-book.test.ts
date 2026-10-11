import {
  priceBookHistorySchema,
  priceBookItemSchema,
  priceBookResponseSchema,
  putPriceBookBodySchema,
} from '../admin-price-book';

const ITEM = { sku: 'DEM-001', description: 'Demolizione tramezzi', unit: 'mq', unit_price: 25, category: 'Demolizioni' };

describe('admin price book schemas (Golden Sync with price_book.py)', () => {
  it('accepts an item as the backend stores it (optional fields absent)', () => {
    const parsed = priceBookItemSchema.parse(ITEM);
    expect(parsed.tags).toEqual([]);
    expect(parsed.vat_agevolata).toBe(false);
  });

  it.each([
    ['a sku with spaces', { sku: 'DEM 001' }],
    ['a negative price', { unit_price: -1 }],
    ['a blank description', { description: '   ' }],
    ['min_qty above max_qty', { min_qty: 5, max_qty: 1 }],
    ['range_min above range_max', { range_min: 9, range_max: 3 }],
    ['an unknown field', { extra: 1 }],
  ])('rejects %s', (_label, patch) => {
    expect(priceBookItemSchema.safeParse({ ...ITEM, ...patch }).success).toBe(false);
  });

  it('rejects duplicate SKUs in a save, ignoring case', () => {
    const result = putPriceBookBodySchema.safeParse({ items: [ITEM, { ...ITEM, sku: 'dem-001' }] });
    expect(result.success).toBe(false);
  });

  it('rejects an empty price book', () => {
    expect(putPriceBookBodySchema.safeParse({ items: [] }).success).toBe(false);
  });

  it('parses the GET response, including an ignored foreign document', () => {
    const parsed = priceBookResponseSchema.parse({
      etag: '"v0"',
      version: 0,
      source: 'seed',
      item_count: 1,
      ignored_document: 'legacy_document',
      items: [ITEM],
    });
    expect(parsed.ignored_document).toBe('legacy_document');
  });

  it('parses the history list', () => {
    const parsed = priceBookHistorySchema.parse({ items: [{ version: 2, reason: 'Prezzi 2026', changed: 3 }] });
    expect(parsed.items[0]).toMatchObject({ version: 2, changed: 3, added: 0 });
  });
});
