/**
 * Admin price book API (/api/admin/price-book) — Golden Sync with
 * backend_python/src/schemas/price_book.py (Phase 128, Fase 6.1a).
 *
 * IMPORTANT: Any change to the Pydantic models MUST be reflected here (1:1 parity).
 */
import { z } from 'zod';

export const PRICE_BOOK_MAX_ITEMS = 2000;
/** Same pattern as SKU_PATTERN in the backend schema. */
export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

export const priceBookItemSchema = z
  .object({
    sku: z.string().regex(SKU_PATTERN),
    description: z.string().trim().min(1).max(300),
    unit: z.string().trim().min(1).max(12),
    unit_price: z.number().min(0).max(1_000_000),
    category: z.string().trim().min(1).max(60),
    subcategory: z.string().trim().max(80).nullable().optional(),
    vat_agevolata: z.boolean().default(false),
    min_qty: z.number().min(0).nullable().optional(),
    max_qty: z.number().min(0).nullable().optional(),
    tags: z.array(z.string().trim().max(40)).max(20).default([]),
    range_min: z.number().min(0).nullable().optional(),
    range_max: z.number().min(0).nullable().optional(),
  })
  .strict()
  .refine((i) => i.min_qty == null || i.max_qty == null || i.min_qty <= i.max_qty, {
    message: 'min_qty è maggiore di max_qty',
    path: ['min_qty'],
  })
  .refine((i) => i.range_min == null || i.range_max == null || i.range_min <= i.range_max, {
    message: 'range_min è maggiore di range_max',
    path: ['range_min'],
  });
export type PriceBookItem = z.infer<typeof priceBookItemSchema>;

export const priceBookResponseSchema = z.object({
  etag: z.string(),
  version: z.number(),
  source: z.enum(['firestore', 'seed']),
  item_count: z.number(),
  updated_at: z.string().nullable().optional(),
  updated_by: z.string().nullable().optional(),
  /** Set when the stored document was ignored (written by another tool). */
  ignored_document: z.enum(['legacy_document', 'invalid_items']).nullable().optional(),
  items: z.array(priceBookItemSchema),
});
export type PriceBookResponse = z.infer<typeof priceBookResponseSchema>;

export const putPriceBookBodySchema = z
  .object({
    items: z.array(priceBookItemSchema).min(1).max(PRICE_BOOK_MAX_ITEMS),
    reason: z.string().max(500).nullable().optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    body.items.forEach((item, index) => {
      const key = item.sku.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({ code: 'custom', message: `SKU duplicato: ${item.sku}`, path: ['items', index, 'sku'] });
      }
      seen.add(key);
    });
  });
export type PutPriceBookBody = z.infer<typeof putPriceBookBodySchema>;

export const priceBookSaveResponseSchema = z.object({
  etag: z.string(),
  version: z.number(),
  item_count: z.number(),
  added: z.number(),
  removed: z.number(),
  changed: z.number(),
});
export type PriceBookSaveResponse = z.infer<typeof priceBookSaveResponseSchema>;

export const priceBookHistoryItemSchema = z.object({
  version: z.number(),
  actor_uid: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  item_count: z.number().default(0),
  added: z.number().default(0),
  removed: z.number().default(0),
  changed: z.number().default(0),
  created_at: z.string().nullable().optional(),
});
export type PriceBookHistoryItem = z.infer<typeof priceBookHistoryItemSchema>;

export const priceBookHistorySchema = z.object({ items: z.array(priceBookHistoryItemSchema) });
export type PriceBookHistory = z.infer<typeof priceBookHistorySchema>;
