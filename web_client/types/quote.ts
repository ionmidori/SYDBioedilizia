/**
 * Quote TypeScript interfaces — Golden Sync with backend_python/src/schemas/quote.py
 *
 * IMPORTANT: Any change to the Pydantic models MUST be reflected here (1:1 parity).
 */
import { z } from 'zod';

import { roomTypeSchema } from '@/types/room';

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
  // Room section of the line (see QuoteRoom); null on a quote without rooms
  room_id: z.string().nullable().optional(),
});
export type QuoteItem = z.infer<typeof quoteItemSchema>;

// ── QuoteRoom (section of a multi-room quote) ────────────────────────────────

// One per room with lines, plus "Generale" (room_id "generale") for the project-wide ones.
export const GENERAL_ROOM_ID = 'generale';

export const quoteRoomSchema = z.object({
  room_id: z.string(),
  room_label: z.string(),
  room_type: roomTypeSchema,
  floor_mq: z.number().min(0).nullable().optional(),
  walls_mq: z.number().min(0).nullable().optional(),
  room_subtotal: z.number().min(0).default(0),
});
export type QuoteRoom = z.infer<typeof quoteRoomSchema>;

// ── QuoteFinancials ──────────────────────────────────────────────────────────

export const quoteFinancialsSchema = z.object({
  subtotal: z.number().default(0),
  vat_rate: z.number().default(0.22),
  vat_amount: z.number().default(0),
  grand_total: z.number().default(0),
});
export type QuoteFinancials = z.infer<typeof quoteFinancialsSchema>;

// ── QuoteRequest (what the client asked for) ─────────────────────────────────

export const quoteRequestSchema = z.object({
  summary: z.string().nullable().optional(),
  technical_notes: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  footage_sqm: z.number().min(0).nullable().optional(),
  budget_cap: z.number().min(0).nullable().optional(),
  channel: quoteChannelSchema.nullable().optional(),
  session_id: z.string().nullable().optional(),
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

export const revisionChangeSchema = z.object({
  change: z.enum(['added', 'removed', 'changed']),
  sku: z.string(),
  room_id: z.string().nullable().optional(),
  before: z.record(z.string(), z.unknown()).nullable().optional(),
  after: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type RevisionChange = z.infer<typeof revisionChangeSchema>;

// Admin review state: lock holder, approval, last reject/reopen reason.
export const quoteReviewSchema = z.object({
  locked_by: z.string().nullable().optional(),
  locked_at: z.string().nullable().optional(),
  approved_by: z.string().nullable().optional(),
  approved_at: z.string().nullable().optional(),
  approved_revision: z.number().nullable().optional(),
  reason: z.string().nullable().optional(),
});
export type QuoteReview = z.infer<typeof quoteReviewSchema>;

export const quoteRevisionSchema = z.object({
  version: z.number().min(1),
  items: z.array(quoteItemSchema).default([]),
  rooms: z.array(quoteRoomSchema).default([]),
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
  diff: z.array(revisionChangeSchema).default([]),
  created_at: z.string().optional(),
});
export type QuoteRevision = z.infer<typeof quoteRevisionSchema>;

// ── Delivery (one send of the approved PDF) ──────────────────────────────────

export const deliveryRecordStatusSchema = z.enum([
  'queued',
  'sent',
  'delivered',
  'bounced',
  'complained',
  'failed',
]);
export type DeliveryRecordStatus = z.infer<typeof deliveryRecordStatusSchema>;

export const deliveryEventRecordSchema = z.object({
  event: z.string(),
  at: z.string(),
  detail: z.string().nullable().optional(),
});

export const quoteDeliverySchema = z.object({
  delivery_id: z.string(),
  to: z.string(),
  cc: z.array(z.string()).default([]),
  subject: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  revision: z.number().min(1),
  pdf_blob_path: z.string(),
  status: deliveryRecordStatusSchema.default('queued'),
  provider: z.string(),
  provider_message_id: z.string().nullable().optional(),
  attempts: z.number().default(0),
  last_error: z.string().nullable().optional(),
  events: z.array(deliveryEventRecordSchema).default([]),
  created_by: z.string(),
  created_at: z.string(),
  sent_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});
export type QuoteDelivery = z.infer<typeof quoteDeliverySchema>;

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
  // Sections of a multi-room quote, in display order (empty: a quote without rooms)
  rooms: z.array(quoteRoomSchema).default([]),
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
  review: quoteReviewSchema.nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  version: z.number().default(1),
  pdf_url: z.string().nullable().optional(),
  pdf_blob_path: z.string().nullable().optional(),
  pdf_revision: z.number().nullable().optional(),
  last_delivery_id: z.string().nullable().optional(),
  sent_at: z.string().nullable().optional(),
  admin_decision: z.string().nullable().optional(),
  reviewed_by: z.string().nullable().optional(),
  started_by: z.string().nullable().optional(),
  delivered_at: z.string().nullable().optional(),
  deleted_at: z.string().nullable().optional(),
});
export type Quote = z.infer<typeof quoteSchema>;

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

// Golden Sync: backend_python/src/api/routes/quote_routes.py → QuoteSubmitResponse
export const quoteSubmitResponseSchema = z.object({
  project_id: z.string(),
  status: z.string(),
  quote_number: z.string().nullable().optional(),
  // True when the quote was already with the team: nothing was sent again.
  duplicate: z.boolean().default(false),
});
export type QuoteSubmitResponse = z.infer<typeof quoteSubmitResponseSchema>;
