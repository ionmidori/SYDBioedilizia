/**
 * Quote TypeScript interfaces — Golden Sync with backend_python/src/schemas/quote.py
 *
 * IMPORTANT: Any change to the Pydantic models MUST be reflected here (1:1 parity).
 */
import { z } from 'zod';

// ── Enums ────────────────────────────────────────────────────────────────────

// Transitions are enforced by backend_python/src/services/quote_state.py.
export const quoteStatusSchema = z.enum([
  'draft',
  'pending_review',
  'in_review',
  'approved',
  'sent',
  'rejected',
  'deleted',
]);
export type QuoteStatus = z.infer<typeof quoteStatusSchema>;

// Email delivery outcome, tracked separately from the review status.
export const quoteDeliveryStatusSchema = z.enum([
  'none',
  'queued',
  'sent',
  'delivered',
  'bounced',
  'complained',
  'failed',
]);
export type QuoteDeliveryStatus = z.infer<typeof quoteDeliveryStatusSchema>;

export const quoteChannelSchema = z.enum(['chat', 'dashboard']);
export type QuoteChannel = z.infer<typeof quoteChannelSchema>;

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

// ── AggregationAdjustment (cross-project batch) ──────────────────────────────

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

// ── QuoteRequest (what the client asked for) ─────────────────────────────────

export const quoteRequestSchema = z.object({
  summary: z.string().nullable().optional(),
  technical_notes: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  footage_sqm: z.number().min(0).nullable().optional(),
  budget_cap: z.number().min(0).nullable().optional(),
  channel: quoteChannelSchema.nullable().optional(),
  session_id: z.string().nullable().optional(),
  batch_id: z.string().nullable().optional(),
});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

// ── Dossier (admin review) ───────────────────────────────────────────────────

export const clientSnapshotSchema = z.object({
  uid: z.string(),
  display_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  is_guest: z.boolean().default(false),
  captured_at: z.string().optional(),
});
export type ClientSnapshot = z.infer<typeof clientSnapshotSchema>;

export const mediaKindSchema = z.enum(['input_photo', 'render', 'video', 'link']);
export type MediaKind = z.infer<typeof mediaKindSchema>;

// Storage path only — short-lived URLs are minted by the backend on read.
export const mediaRefSchema = z.object({
  media_id: z.string(),
  kind: mediaKindSchema,
  blob_path: z.string().nullable().optional(),
  external_url: z.string().nullable().optional(),
  mime: z.string().nullable().optional(),
  label: z.string(),
  source_media_id: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});
export type MediaRef = z.infer<typeof mediaRefSchema>;

export const revisionActorSchema = z.enum(['ai', 'admin', 'system']);

export const quoteRevisionSchema = z.object({
  version: z.number().min(1),
  items: z.array(quoteItemSchema).default([]),
  financials: quoteFinancialsSchema.default({
    subtotal: 0,
    vat_rate: 0.22,
    vat_amount: 0,
    grand_total: 0,
  }),
  admin_notes: z.string().nullable().optional(),
  actor_uid: z.string().nullable().optional(),
  actor_kind: revisionActorSchema,
  reason: z.string().nullable().optional(),
  created_at: z.string().optional(),
});
export type QuoteRevision = z.infer<typeof quoteRevisionSchema>;

// ── QuoteSchema ──────────────────────────────────────────────────────────────

export const quoteSchema = z.object({
  id: z.string().nullable().optional(),
  doc_type: z.literal('quote').default('quote'),
  project_id: z.string(),
  user_id: z.string(),
  // Human-readable reference, e.g. PRV-2026-0042 (never contains personal data)
  quote_number: z.string().nullable().optional(),
  quote_year: z.number().nullable().optional(),
  quote_seq: z.number().nullable().optional(),
  status: quoteStatusSchema.default('draft'),
  delivery_status: quoteDeliveryStatusSchema.default('none'),
  items: z.array(quoteItemSchema).default([]),
  financials: quoteFinancialsSchema.default({
    subtotal: 0,
    vat_rate: 0.22,
    vat_amount: 0,
    grand_total: 0,
  }),
  admin_notes: z.string().nullable().optional(),
  request: quoteRequestSchema.nullable().optional(),
  client_snapshot: clientSnapshotSchema.nullable().optional(),
  media: z.array(mediaRefSchema).default([]),
  search_keys: z.array(z.string()).default([]),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  version: z.number().default(1),
  pdf_url: z.string().nullable().optional(),
  pdf_blob_path: z.string().nullable().optional(),
  admin_decision: z.string().nullable().optional(),
  reviewed_by: z.string().nullable().optional(),
  started_by: z.string().nullable().optional(),
  delivered_at: z.string().nullable().optional(),
  deleted_at: z.string().nullable().optional(),
});
export type Quote = z.infer<typeof quoteSchema>;

// ── Multi-Project Batch Submission ──────────────────────────────────────────

export const batchStatusSchema = z.enum([
  'draft',
  'submitted',
  'partially_approved',
  'approved',
  'rejected',
]);
export type BatchStatus = z.infer<typeof batchStatusSchema>;

export const batchProjectSchema = z.object({
  project_id: z.string(),
  project_name: z.string(),
  status: quoteStatusSchema.default('draft'),
  item_count: z.number().min(0).default(0),
  subtotal: z.number().min(0).default(0),
  admin_notes: z.string().nullable().optional(),
});
export type BatchProject = z.infer<typeof batchProjectSchema>;

export const quoteBatchSchema = z.object({
  id: z.string().nullable().optional(),
  user_id: z.string(),
  status: batchStatusSchema.default('draft'),
  projects: z.array(batchProjectSchema).default([]),
  total_projects: z.number().min(0).default(0),
  batch_subtotal: z.number().min(0).default(0),
  batch_grand_total: z.number().min(0).default(0),
  submitted_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  // Cross-project aggregation preview (advisory, not mutating)
  potential_savings: z.number().min(0).default(0),
  aggregation_preview: z.array(aggregationAdjustmentSchema).default([]),
});
export type QuoteBatch = z.infer<typeof quoteBatchSchema>;

// ── QuoteListItem (client area "Preventivi" section) ─────────────────────────
// Golden Sync: backend_python/src/api/routes/quote_routes.py → QuoteListItemResponse

export const quoteListItemSchema = z.object({
  project_id: z.string(),
  project_name: z.string().default(''),
  // Human-readable reference (PRV-YYYY-NNNN); null for quotes not yet numbered
  quote_number: z.string().nullable().optional(),
  status: z.string(),
  // Masked to 0 by the backend for non-admin callers until the quote is approved
  grand_total: z.number().default(0),
  item_count: z.number().min(0).default(0),
  updated_at: z.string().default(''),
  pdf_available: z.boolean().default(false),
});
export type QuoteListItem = z.infer<typeof quoteListItemSchema>;

export const quoteListResponseSchema = z.array(quoteListItemSchema);

export const quotePdfUrlSchema = z.object({
  pdf_url: z.string(),
  expires_in_seconds: z.number().default(900),
});
export type QuotePdfUrl = z.infer<typeof quotePdfUrlSchema>;
