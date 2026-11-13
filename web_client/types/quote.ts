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

// A work the technician quotes by hand (no price-book line computed it).
// `origin` mirrors ManualWorkOriginType in src/schemas/quote.py ('package' |
// 'reuse' | 'client_request' | 'price_book') but is read as an open string: the
// UI does not use it, and a value added by a newer backend must not make the
// whole quote unreadable in a frontend deployed earlier.
export const manualWorkItemSchema = z.object({
  work: z.string(),
  room_id: z.string().nullable().optional(),
  room_label: z.string().nullable().optional(),
  origin: z.string(),
});
export type ManualWorkItem = z.infer<typeof manualWorkItemSchema>;

// Something in the AI draft the technician should check. `kind` is an open
// string, as in the backend: a stored draft stays readable when a kind is added.
export const quoteAiWarningSchema = z.object({
  kind: z.string(),
  message: z.string(),
  room_id: z.string().nullable().optional(),
  room_label: z.string().nullable().optional(),
  skus: z.array(z.string()).default([]),
});
export type QuoteAiWarning = z.infer<typeof quoteAiWarningSchema>;

export const quoteRequestSchema = z.object({
  summary: z.string().nullable().optional(),
  technical_notes: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  footage_sqm: z.number().min(0).nullable().optional(),
  budget_cap: z.number().min(0).nullable().optional(),
  channel: quoteChannelSchema.nullable().optional(),
  session_id: z.string().nullable().optional(),
  // Replaced by every AI draft (an empty list clears the previous draft's).
  manual_work: z.array(manualWorkItemSchema).default([]),
  ai_warnings: z.array(quoteAiWarningSchema).default([]),
});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

// ── Price range (schemas/price_range.py, Phase 140 step 3) ──────────────────

/** The range of an AI draft, VAT included, for the team. The client gets the
 * precision only (PricePrecision): never an amount before approval. */
export const priceEstimateSchema = z.object({
  low: z.number().min(0).optional(),
  high: z.number().min(0).optional(),
  precision: z.number().int().min(0).max(100).nullable().optional(),
  policy_version: z.string().optional(),
});
export type PriceEstimate = z.infer<typeof priceEstimateSchema>;

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

// A change the client asked in the chat while the team had the quote
// (backend src/services/quote_followup.py): nothing was written to the items.
export const clientFollowupSchema = z.object({
  requested_at: z.string(),
  count: z.number().min(1),
  version: z.number().min(1),
});
export type ClientFollowup = z.infer<typeof clientFollowupSchema>;

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
  estimate: priceEstimateSchema.nullable().optional(),
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
  // Price range of the AI draft: the team reads it all, the client its precision only.
  estimate: priceEstimateSchema.nullable().optional(),
  admin_notes: z.string().nullable().optional(),
  request: quoteRequestSchema.nullable().optional(),
  client_snapshot: clientSnapshotSchema.nullable().optional(),
  media: z.array(mediaRefSchema).default([]),
  search_keys: z.array(z.string()).default([]),
  review: quoteReviewSchema.nullable().optional(),
  client_followup: clientFollowupSchema.nullable().optional(),
  // The revision in progress was opened by the client in the chat (Phase 139 PR-3).
  client_revision: z.boolean().nullable().optional(),
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

// ── History of the house quote (GET /quote/{id}/history, Phase 139 PR-3) ────
// Golden Sync: backend_python/src/schemas/quote.py → RevisionInProgress,
// QuoteHistoryItem, QuoteHistoryResponse.

// draft: the client can send it to the team; with_team: the team has it;
// rejected: the team declined it (a new request in the chat opens another).
export const revisionInProgressStateSchema = z.enum(['draft', 'with_team', 'rejected']);
export type RevisionInProgressState = z.infer<typeof revisionInProgressStateSchema>;

/**
 * The next revision of a quote the client received, opened from the chat. In
 * `draft` its lines WITHOUT prices (masked to 0); once with the team, no lines.
 */
export const revisionInProgressSchema = z.object({
  state: revisionInProgressStateSchema,
  items: z.array(quoteItemSchema).default([]),
  rooms: z.array(quoteRoomSchema).default([]),
});
export type RevisionInProgress = z.infer<typeof revisionInProgressSchema>;

/** A revision that reached the client (Rev. N of the PDF and of the email). */
export const quoteHistoryItemSchema = z.object({
  revision: z.number().min(1),
  sent_at: z.string(),
  grand_total: z.number(),
  pdf_available: z.boolean().default(false),
});
export type QuoteHistoryItem = z.infer<typeof quoteHistoryItemSchema>;

export const quoteHistorySchema = z.object({
  in_progress: revisionInProgressSchema.nullable().default(null),
  // Newest first
  sent: z.array(quoteHistoryItemSchema).default([]),
});
export type QuoteHistory = z.infer<typeof quoteHistorySchema>;

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
