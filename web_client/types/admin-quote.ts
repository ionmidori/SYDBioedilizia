/**
 * Admin quote review API (/api/admin) — Golden Sync with
 * backend_python/src/schemas/admin_quote.py (Phase 128 PR 3.1).
 *
 * IMPORTANT: Any change to the Pydantic models MUST be reflected here (1:1 parity).
 */
import { z } from 'zod';

import {
  deliveryRecordStatusSchema,
  manualWorkItemSchema,
  mediaRefSchema,
  priceEstimateSchema,
  quoteAiWarningSchema,
  quoteDeliveryStatusSchema,
  quoteFinancialsSchema,
  quoteItemSchema,
  quoteRoomSchema,
  quoteSchema,
  quoteStatusSchema,
} from './quote';

export const adminMeSchema = z.object({
  uid: z.string(),
  email: z.string().nullable().optional(),
  role: z.string(),
  mfa: z.boolean(),
});
export type AdminMe = z.infer<typeof adminMeSchema>;

export const adminQuoteListItemSchema = z.object({
  project_id: z.string(),
  quote_number: z.string().nullable().optional(),
  client_display_name: z.string().nullable().optional(),
  client_email: z.string().nullable().optional(),
  client_is_guest: z.boolean().default(false),
  status: quoteStatusSchema,
  delivery_status: quoteDeliveryStatusSchema.default('none'),
  grand_total: z.number().default(0),
  item_count: z.number().default(0),
  channel: z.string().nullable().optional(),
  summary: z.string().default(''),
  thumbnail_media_id: z.string().nullable().optional(),
  locked_by: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});
export type AdminQuoteListItem = z.infer<typeof adminQuoteListItemSchema>;

export const adminQuoteListSchema = z.object({
  items: z.array(adminQuoteListItemSchema),
  next_cursor: z.string().nullable().optional(),
});
export type AdminQuoteList = z.infer<typeof adminQuoteListSchema>;

// MediaRef plus a short-lived inline URL (null if it could not be signed).
export const dossierMediaSchema = mediaRefSchema.extend({
  url: z.string().nullable().optional(),
});
export type DossierMedia = z.infer<typeof dossierMediaSchema>;

export const clientLiveSchema = z.object({
  display_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
});
export type ClientLive = z.infer<typeof clientLiveSchema>;

export const revisionSummarySchema = z.object({
  version: z.number(),
  actor_kind: z.string(),
  actor_uid: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  grand_total: z.number().nullable().optional(),
  change_count: z.number().default(0),
});
export type RevisionSummary = z.infer<typeof revisionSummarySchema>;

export const deliverySummarySchema = z.object({
  delivery_id: z.string(),
  to: z.string(),
  cc: z.array(z.string()).default([]),
  revision: z.number(),
  status: deliveryRecordStatusSchema,
  provider: z.string(),
  attempts: z.number().default(0),
  last_error: z.string().nullable().optional(),
  created_by: z.string(),
  created_at: z.string().nullable().optional(),
  sent_at: z.string().nullable().optional(),
  last_event: z.string().nullable().optional(),
  last_event_at: z.string().nullable().optional(),
});
export type DeliverySummary = z.infer<typeof deliverySummarySchema>;

// AI revision proposal: a change the client asked in the chat while the team had
// the quote, never written on it (the backend keeps its specs to itself).
export const quoteProposalSchema = z.object({
  based_on_version: z.number(),
  created_at: z.string(),
  summary: z.string().default(''),
  items: z.array(quoteItemSchema).default([]),
  rooms: z.array(quoteRoomSchema).default([]),
  financials: quoteFinancialsSchema.default({
    subtotal: 0,
    vat_rate: 0.22,
    vat_amount: 0,
    grand_total: 0,
  }),
  estimate: priceEstimateSchema.nullable().optional(),
  manual_work: z.array(manualWorkItemSchema).default([]),
  ai_warnings: z.array(quoteAiWarningSchema).default([]),
  applied_at: z.string().nullable().optional(),
});
export type QuoteProposal = z.infer<typeof quoteProposalSchema>;

export const quoteDossierSchema = z.object({
  project_id: z.string(),
  project_name: z.string().nullable().optional(),
  etag: z.string(),
  quote: quoteSchema,
  client_live: clientLiveSchema.nullable().optional(),
  client_profile_changed: z.boolean().default(false),
  media: z.array(dossierMediaSchema).default([]),
  revisions: z.array(revisionSummarySchema).default([]),
  deliveries: z.array(deliverySummarySchema).default([]),
  proposal: quoteProposalSchema.nullable().optional(),
});
export type QuoteDossier = z.infer<typeof quoteDossierSchema>;

export const adminChatRoleSchema = z.enum(['user', 'assistant']);
// Why part of the chat is highlighted: a change asked while the team had the
// quote (`followup`), or the revision the client opened after a send (`revision`).
export const chatChangeKindSchema = z.enum(['followup', 'revision']);

// One turn of the client chat as the admin reads it: text only, no tool rows.
export const adminChatMessageSchema = z.object({
  id: z.string(),
  role: adminChatRoleSchema,
  text: z.string(),
  at: z.string().nullable().optional(),
  room_label: z.string().nullable().optional(),
  has_media: z.boolean().default(false),
  in_change: z.boolean().default(false),
});
export type AdminChatMessage = z.infer<typeof adminChatMessageSchema>;

// The client chat of a quote, oldest first. A kind without `change_since`: the
// start of the change is not known, nothing is highlighted.
export const adminChatSchema = z.object({
  messages: z.array(adminChatMessageSchema).default([]),
  change_kind: chatChangeKindSchema.nullable().optional(),
  change_since: z.string().nullable().optional(),
  truncated: z.boolean().default(false),
});
export type AdminChat = z.infer<typeof adminChatSchema>;

export const editQuoteBodySchema = z
  .object({
    items: z.array(quoteItemSchema).max(200).nullable().optional(),
    admin_notes: z.string().max(4000).nullable().optional(),
    vat_rate: z.number().min(0).max(0.5).nullable().optional(),
    reason: z.string().max(500).nullable().optional(),
  })
  .strict();
export type EditQuoteBody = z.infer<typeof editQuoteBodySchema>;

// Which AI proposal the admin confirmed: the chat replaces it at each request.
export const applyProposalBodySchema = z
  .object({
    proposal_created_at: z.string(),
  })
  .strict();
export type ApplyProposalBody = z.infer<typeof applyProposalBodySchema>;

export const reasonBodySchema = z
  .object({
    reason: z.string().min(3).max(1000),
  })
  .strict();
export type ReasonBody = z.infer<typeof reasonBodySchema>;

export const quoteWriteResponseSchema = z.object({
  project_id: z.string(),
  status: quoteStatusSchema,
  version: z.number(),
  quote_number: z.string().nullable().optional(),
  etag: z.string(),
  pdf_ready: z.boolean().nullable().optional(),
  pdf_preview_url: z.string().nullable().optional(),
});
export type QuoteWriteResponse = z.infer<typeof quoteWriteResponseSchema>;

export const mediaUrlResponseSchema = z.object({
  url: z.string(),
  filename: z.string().default(''),
  expires_in_seconds: z.number().default(900),
});
export type MediaUrlResponse = z.infer<typeof mediaUrlResponseSchema>;

// What the Send dialog pre-fills: the admin can change every field.
export const sendDefaultsSchema = z.object({
  to: z.string().nullable().optional(),
  to_source: z.enum(['snapshot', 'profile', 'none']),
  subject: z.string(),
  body_preview: z.string(),
  attachment_name: z.string(),
  revision: z.number(),
  pdf_ready: z.boolean(),
});
export type SendDefaults = z.infer<typeof sendDefaultsSchema>;

export const sendQuoteBodySchema = z
  .object({
    to: z.email(),
    cc: z.array(z.email()).max(3).default([]),
    subject: z.string().min(3).max(200).nullable().optional(),
    message: z.string().max(2000).nullable().optional(),
  })
  .strict();
export type SendQuoteBody = z.infer<typeof sendQuoteBodySchema>;

export const sendQuoteResponseSchema = z.object({
  project_id: z.string(),
  delivery_id: z.string(),
  status: quoteStatusSchema,
  delivery_status: deliveryRecordStatusSchema,
  quote_number: z.string().nullable().optional(),
  duplicate: z.boolean().default(false),
});
export type SendQuoteResponse = z.infer<typeof sendQuoteResponseSchema>;
