/**
 * Admin quote review API (/api/admin) — Golden Sync with
 * backend_python/src/schemas/admin_quote.py (Phase 128 PR 3.1).
 *
 * IMPORTANT: Any change to the Pydantic models MUST be reflected here (1:1 parity).
 */
import { z } from 'zod';

import {
  deliveryRecordStatusSchema,
  mediaRefSchema,
  quoteDeliveryStatusSchema,
  quoteItemSchema,
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
});
export type QuoteDossier = z.infer<typeof quoteDossierSchema>;

export const editQuoteBodySchema = z
  .object({
    items: z.array(quoteItemSchema).max(200).nullable().optional(),
    admin_notes: z.string().max(4000).nullable().optional(),
    vat_rate: z.number().min(0).max(0.5).nullable().optional(),
    reason: z.string().max(500).nullable().optional(),
  })
  .strict();
export type EditQuoteBody = z.infer<typeof editQuoteBodySchema>;

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
