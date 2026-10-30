/**
 * Admin console content API — portfolio, testimonials, KPIs, GDPR.
 * Golden Sync with backend_python/src/schemas/admin_content.py (Phase 128, Fase 6.1b).
 *
 * IMPORTANT: Any change to the Pydantic models MUST be reflected here (1:1 parity).
 */
import { z } from 'zod';

// ── Portfolio ────────────────────────────────────────────────────────────────

export const PORTFOLIO_CATEGORIES = [
  'Soggiorno',
  'Cucina',
  'Bagno',
  'Camera da letto',
  'Ufficio',
  'Intero Appartamento',
  'Esterni',
  'Altro',
] as const;
export const portfolioCategorySchema = z.enum(PORTFOLIO_CATEGORIES);

export const portfolioStatsSchema = z
  .object({
    area: z.string().max(40).default(''),
    duration: z.string().max(40).default(''),
    budget: z.string().max(40).default(''),
  })
  .strict();
export type PortfolioStats = z.infer<typeof portfolioStatsSchema>;

export const portfolioWriteSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    category: portfolioCategorySchema,
    location: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).default(''),
    stats: portfolioStatsSchema.default({ area: '', duration: '', budget: '' }),
    image_url: z.string().min(1).max(1000),
    active: z.boolean().default(true),
  })
  .strict();
export type PortfolioWrite = z.infer<typeof portfolioWriteSchema>;

export const portfolioPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    category: portfolioCategorySchema,
    location: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000),
    stats: portfolioStatsSchema,
    image_url: z.string().min(1).max(1000),
    active: z.boolean(),
    order: z.number().int().min(1).max(10_000),
  })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nessuna modifica da salvare' });
export type PortfolioPatch = z.infer<typeof portfolioPatchSchema>;

export const portfolioProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  location: z.string(),
  description: z.string().default(''),
  stats: portfolioStatsSchema.default({ area: '', duration: '', budget: '' }),
  image_url: z.string().nullable().optional(),
  active: z.boolean().default(true),
  order: z.number().default(0),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});
export type PortfolioProject = z.infer<typeof portfolioProjectSchema>;

export const portfolioImageUploadedSchema = z.object({
  image_url: z.string(),
  width: z.number(),
  height: z.number(),
  size_bytes: z.number(),
});
export type PortfolioImageUploaded = z.infer<typeof portfolioImageUploadedSchema>;

export const portfolioListSchema = z.object({
  items: z.array(portfolioProjectSchema),
  visible: z.number(),
});
export type PortfolioList = z.infer<typeof portfolioListSchema>;

// ── Testimonials ─────────────────────────────────────────────────────────────

export const testimonialStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type TestimonialStatus = z.infer<typeof testimonialStatusSchema>;

export const adminTestimonialSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string().default(''),
  text: z.string(),
  rating: z.number().default(5),
  status: testimonialStatusSchema,
  admin_notes: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  reviewed_at: z.string().nullable().optional(),
});
export type AdminTestimonial = z.infer<typeof adminTestimonialSchema>;

export const testimonialStatsSchema = z.object({
  pending: z.number().default(0),
  approved: z.number().default(0),
  rejected: z.number().default(0),
});
export type TestimonialStats = z.infer<typeof testimonialStatsSchema>;

export const testimonialListSchema = z.object({
  items: z.array(adminTestimonialSchema),
  stats: testimonialStatsSchema,
});
export type TestimonialList = z.infer<typeof testimonialListSchema>;

export const moderateBodySchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    notes: z.string().max(500).nullable().optional(),
  })
  .strict();
export type ModerateBody = z.infer<typeof moderateBodySchema>;

export const moderateResponseSchema = z.object({
  id: z.string(),
  status: testimonialStatusSchema,
  stats: testimonialStatsSchema,
});
export type ModerateResponse = z.infer<typeof moderateResponseSchema>;

// ── KPIs ─────────────────────────────────────────────────────────────────────

export const recentApprovalSchema = z.object({
  project_id: z.string(),
  quote_number: z.string().nullable().optional(),
  client_display_name: z.string().nullable().optional(),
  grand_total: z.number().default(0),
  approved_at: z.string().nullable().optional(),
});
export type RecentApproval = z.infer<typeof recentApprovalSchema>;

export const weeklyApprovalsSchema = z.object({
  week_start: z.string(),
  approvals: z.number(),
});
export type WeeklyApprovals = z.infer<typeof weeklyApprovalsSchema>;

export const adminKpisSchema = z.object({
  by_status: z.record(z.string(), z.number()),
  pending_value: z.number(),
  pending_truncated: z.boolean().default(false),
  weekly_approvals: z.array(weeklyApprovalsSchema),
  recent_approvals: z.array(recentApprovalSchema),
  testimonials: testimonialStatsSchema,
  generated_at: z.string(),
});
export type AdminKpis = z.infer<typeof adminKpisSchema>;

// ── GDPR ─────────────────────────────────────────────────────────────────────

export const gdprPhaseSchema = z.object({
  phase: z.number(),
  months_inactive: z.number(),
  action: z.string(),
});

export const gdprStatusSchema = z.object({
  phases: z.array(gdprPhaseSchema),
  scheduler_secret_configured: z.boolean(),
});
export type GdprStatus = z.infer<typeof gdprStatusSchema>;

/** What the retention phase erased. With `orphans_applied` false the orphan purge is off and `orphans` is what it would erase. */
export const retentionSummarySchema = z.object({
  orphans_applied: z.boolean(),
  guest_sessions: z.number(),
  expired_holds: z.number(),
  orphans: z.number(),
  orphans_kept: z.number(),
  made_permanent: z.number(),
  truncated: z.boolean(),
});
export type RetentionSummary = z.infer<typeof retentionSummarySchema>;

export const gdprRunResultSchema = z.object({
  status: z.string(),
  warned: z.number(),
  disabled: z.number(),
  anonymized: z.number(),
  errors: z.array(z.string()),
  // null: the retention phase did not run. Absent (a backend older than this
  // frontend, e.g. while a release rolls out) means the same.
  retention: retentionSummarySchema.nullable().default(null),
});
export type GdprRunResult = z.infer<typeof gdprRunResultSchema>;
