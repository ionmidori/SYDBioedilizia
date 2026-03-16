/**
 * Quote TypeScript interfaces — Golden Sync with backend_python/src/schemas/quote.py
 *
 * IMPORTANT: Any change to the Pydantic models MUST be reflected here (1:1 parity).
 */
import { z } from 'zod';

// ── Enums ────────────────────────────────────────────────────────────────────

export const quoteStatusSchema = z.enum([
  'draft',
  'pending_review',
  'approved',
  'sent',
  'rejected',
]);
export type QuoteStatus = z.infer<typeof quoteStatusSchema>;

export const roomTypeSchema = z.enum([
  'bagno',
  'cucina',
  'soggiorno',
  'camera',
  'corridoio',
  'ingresso',
  'terrazzo',
  'altro',
]);
export type RoomType = z.infer<typeof roomTypeSchema>;

// ── QuoteItem ────────────────────────────────────────────────────────────────

export const quoteItemSchema = z.object({
  sku: z.string(),
  description: z.string(),
  unit: z.string(),
  qty: z.number().min(0),
  unit_price: z.number().min(0),
  total: z.number().min(0),
  ai_reasoning: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  manual_override: z.boolean().default(false),
  room_id: z.string().nullable().optional(),
});
export type QuoteItem = z.infer<typeof quoteItemSchema>;

// ── QuoteFinancials ──────────────────────────────────────────────────────────

export const quoteFinancialsSchema = z.object({
  subtotal: z.number().default(0),
  vat_rate: z.number().default(0.22),
  vat_amount: z.number().default(0),
  grand_total: z.number().default(0),
});
export type QuoteFinancials = z.infer<typeof quoteFinancialsSchema>;

// ── RoomQuote (multi-room) ───────────────────────────────────────────────────

export const roomQuoteSchema = z.object({
  room_id: z.string(),
  room_label: z.string(),
  room_type: roomTypeSchema,
  floor_mq: z.number().min(0).nullable().optional(),
  walls_mq: z.number().min(0).nullable().optional(),
  items: z.array(quoteItemSchema).default([]),
  room_subtotal: z.number().default(0),
  completeness_score: z.number().min(0).max(1).default(1),
  missing_info: z.array(z.string()).default([]),
  analyzed_at: z.string().nullable().optional(),
  media_urls: z.array(z.string()).default([]),
  version: z.number().default(1),
});
export type RoomQuote = z.infer<typeof roomQuoteSchema>;

// ── AggregationAdjustment (multi-room) ───────────────────────────────────────

export const aggregationAdjustmentTypeSchema = z.enum([
  'dedup_singleton',
  'merge_quantities',
  'volume_discount',
  'shared_overhead',
]);
export type AggregationAdjustmentType = z.infer<typeof aggregationAdjustmentTypeSchema>;

export const aggregationAdjustmentSchema = z.object({
  adjustment_type: aggregationAdjustmentTypeSchema,
  description: z.string(),
  sku: z.string().nullable().optional(),
  original_total: z.number(),
  adjusted_total: z.number(),
  savings: z.number().min(0),
  affected_rooms: z.array(z.string()).default([]),
});
export type AggregationAdjustment = z.infer<typeof aggregationAdjustmentSchema>;

// ── QuoteSchema ──────────────────────────────────────────────────────────────

export const quoteSchema = z.object({
  id: z.string().nullable().optional(),
  project_id: z.string(),
  user_id: z.string(),
  status: quoteStatusSchema.default('draft'),
  items: z.array(quoteItemSchema).default([]),
  financials: quoteFinancialsSchema.default({
    subtotal: 0,
    vat_rate: 0.22,
    vat_amount: 0,
    grand_total: 0,
  }),
  admin_notes: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  version: z.number().default(1),
  // Multi-room fields (backward-compatible: defaults to empty)
  rooms: z.array(roomQuoteSchema).default([]),
  aggregation_adjustments: z.array(aggregationAdjustmentSchema).default([]),
  aggregated_subtotal: z.number().nullable().optional(),
});
export type Quote = z.infer<typeof quoteSchema>;
