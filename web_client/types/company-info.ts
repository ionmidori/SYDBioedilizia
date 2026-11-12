/**
 * Company info ("scheda società", Phase 141) — Golden Sync with
 * backend_python/src/schemas/company_info.py and company_info_api.py.
 *
 * The true facts about SYD Bioedilizia, edited only from the admin console and
 * read by the site and the AI. IMPORTANT: any change to the Pydantic models
 * MUST be reflected here (1:1 parity), cross-field rules included.
 */
import { z } from 'zod';

/** Sections every company info has: they can be emptied, never removed. */
export const BUILTIN_SECTION_SLUGS = [
  'garanzie',
  'pagamenti',
  'pratiche-permessi',
  'bonus-fiscali',
  'tempi-lavori',
  'chi-lavora',
  'certificazioni-materiali',
  'social',
] as const;
export const COMPANY_INFO_MAX_BYTES = 800 * 1024;

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export const iconNameSchema = z.enum([
  'Coins', 'FileText', 'Sparkles', 'Wrench', 'Award', 'Shield', 'Leaf', 'LayoutDashboard',
  'Wand2', 'HardHat', 'CheckCircle', 'Phone', 'Clock', 'MapPin', 'Hammer', 'Home',
]);
export type IconName = z.infer<typeof iconNameSchema>;

const text = z.string().trim().min(1).max(2000);
const line = z.string().trim().min(1).max(1000);
const title = z.string().trim().min(1).max(120);
const slug = z.string().trim().max(60).regex(SLUG_PATTERN);

// ── Text blocks (rendered by components/faq/FAQAnswer.tsx) ───────────────────

export const textBlockSchema = z.object({ type: z.enum(['lead', 'p', 'note', 'callout']), text }).strict();
export const listBlockSchema = z.object({ type: z.enum(['ul', 'ol']), items: z.array(line).min(1).max(30) }).strict();
export const definitionSchema = z.object({ term: title, description: text }).strict();
export const definitionsBlockSchema = z
  .object({ type: z.literal('definitions'), items: z.array(definitionSchema).min(1).max(30) })
  .strict();
export const blockSchema = z.union([textBlockSchema, listBlockSchema, definitionsBlockSchema]);
export type Block = z.infer<typeof blockSchema>;
const blocks = z.array(blockSchema).max(60);

// ── Facts ────────────────────────────────────────────────────────────────────

export const addressSchema = z
  .object({
    street: title,
    postal_code: z.string().trim().min(1).max(10),
    city: title,
    region: z.string().trim().min(1).max(10),
    country: z.string().trim().length(2),
  })
  .strict();

export const identitySchema = z
  .object({
    name: title,
    legal_name: title,
    vat_id: z.string().trim().regex(/^\d{11}$/),
    address: addressSchema,
    phone: z.string().trim().min(1).max(30),
    whatsapp: z.string().trim().min(1).max(30).nullable().optional(),
    email: z.string().trim().max(120).regex(EMAIL_PATTERN),
  })
  .strict();
export type Identity = z.infer<typeof identitySchema>;

export const openingHoursSchema = z
  .object({
    days: z.string().trim().min(1).max(60),
    opens: z.string().trim().regex(TIME_PATTERN),
    closes: z.string().trim().regex(TIME_PATTERN),
  })
  .strict()
  // "HH:MM" strings compare in time order.
  .refine((h) => h.opens < h.closes, { message: "L'orario di chiusura deve seguire l'apertura", path: ['closes'] });
export type OpeningHours = z.infer<typeof openingHoursSchema>;

export const localitySchema = z.object({ name: title, comune: title }).strict();
export const serviceAreaSchema = z
  .object({
    summary: title,
    places: z.array(title).min(1).max(500),
    localities: z.array(localitySchema).max(500).default([]),
  })
  .strict();

export const serviceItemSchema = z
  .object({ title: z.string().trim().min(1).max(80), description: z.string().trim().max(300).default('') })
  .strict();
export type ServiceItem = z.infer<typeof serviceItemSchema>;
export const servicesSchema = z
  .object({ summary: z.string().trim().min(1).max(300), items: z.array(serviceItemSchema).min(1).max(100) })
  .strict();

export const homeServiceSchema = z
  .object({ id: slug, title, description: text, icon: iconNameSchema, action: z.enum(['dashboard', 'chat']) })
  .strict();
export type HomeService = z.infer<typeof homeServiceSchema>;

export const quoteTermsSchema = z
  .object({
    validity_days: z.number().int().min(1).max(365),
    payment_terms: z.array(line).min(1).max(10),
    short_notice: text,
    disclaimer_title: title,
    disclaimer: text,
    signature_label: title,
  })
  .strict();

export const sectionSchema = z
  .object({
    slug,
    title: z.string().trim().min(1).max(80),
    blocks: blocks.default([]),
    builtin: z.boolean().default(false),
  })
  .strict();
export type Section = z.infer<typeof sectionSchema>;

export const faqCategorySchema = z.object({ name: z.string().trim().min(1).max(40), icon: iconNameSchema }).strict();
export const faqItemSchema = z
  .object({
    slug,
    question: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1).max(40),
    answer: blocks.min(1),
    section_slug: slug.nullable().optional(),
  })
  .strict();
export type FaqItem = z.infer<typeof faqItemSchema>;

export const excellenceSchema = z.object({ title, text, icon: iconNameSchema }).strict();
export const aboutSchema = z
  .object({
    title,
    subtitle: title,
    intro: blocks,
    philosophy_title: title,
    philosophy: blocks,
    excellences_title: title,
    excellences: z.array(excellenceSchema).max(12).default([]),
    services_title: title,
    services_subtitle: title,
    services_intro: blocks,
    why_title: title,
    why_choose: blocks,
    cta_label: z.string().trim().min(1).max(60),
    cta_note: z.string().trim().max(300).default(''),
  })
  .strict();

export type About = z.infer<typeof aboutSchema>;

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) repeated.push(value);
    seen.add(key);
  }
  return repeated;
}

export const companyInfoSchema = z
  .object({
    identity: identitySchema,
    hours: z.array(openingHoursSchema).max(14).default([]),
    hours_note: z.string().trim().max(300).default(''),
    service_area: serviceAreaSchema,
    services: servicesSchema,
    site_visit: blocks,
    quote_terms: quoteTermsSchema,
    home_services: z.array(homeServiceSchema).max(12).default([]),
    sections: z.array(sectionSchema),
    faq_categories: z.array(faqCategorySchema).min(1).max(20),
    faq: z.array(faqItemSchema).max(200).default([]),
    about: aboutSchema,
  })
  .strict()
  .superRefine((info, ctx) => {
    const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: 'custom', message, path });
    const slugs = new Set(info.sections.map((s) => s.slug));
    const missing = BUILTIN_SECTION_SLUGS.filter((s) => !slugs.has(s));
    if (missing.length) issue(`Sezioni di base non rimovibili: ${missing.join(', ')}`, ['sections']);
    const builtin = new Set<string>(BUILTIN_SECTION_SLUGS);
    const wrong = info.sections.filter((s) => s.builtin !== builtin.has(s.slug)).map((s) => s.slug);
    if (wrong.length) issue(`Solo le sezioni di base sono "builtin": ${wrong.join(', ')}`, ['sections']);

    const lists: [string, string[], string][] = [
      ['sections', info.sections.map((s) => s.slug), 'Sezione duplicata'],
      ['faq', info.faq.map((f) => f.slug), 'FAQ duplicata'],
      ['home_services', info.home_services.map((h) => h.id), 'Servizio duplicato'],
      ['faq_categories', info.faq_categories.map((c) => c.name), 'Categoria duplicata'],
      ['service_area', info.service_area.places, 'Comune duplicato'],
    ];
    for (const [path, values, label] of lists) {
      const repeated = duplicates(values);
      if (repeated.length) issue(`${label}: ${repeated.slice(0, 10).join(', ')}`, [path]);
    }
    const places = new Set(info.service_area.places.map((p) => p.toLowerCase()));
    const foreign = info.service_area.localities.filter((l) => !places.has(l.comune.toLowerCase())).map((l) => l.comune);
    if (foreign.length) issue(`Località di un comune non in elenco: ${foreign.slice(0, 10).join(', ')}`, ['service_area']);
    const categories = new Set(info.faq_categories.map((c) => c.name));
    const unknown = info.faq.filter((f) => !categories.has(f.category)).map((f) => f.category);
    if (unknown.length) issue(`Categoria FAQ inesistente: ${unknown.slice(0, 10).join(', ')}`, ['faq']);
    const orphan = info.faq.filter((f) => f.section_slug != null && !slugs.has(f.section_slug)).map((f) => f.section_slug);
    if (orphan.length) issue(`FAQ collegata a una sezione inesistente: ${orphan.slice(0, 10).join(', ')}`, ['faq']);
    const size = new TextEncoder().encode(JSON.stringify(info)).length;
    if (size > COMPANY_INFO_MAX_BYTES) issue(`Scheda troppo grande (${Math.floor(size / 1024)} KiB)`, []);
  });
export type CompanyInfo = z.infer<typeof companyInfoSchema>;

// ── API envelopes (company_info_api.py) ──────────────────────────────────────

export const companyInfoResponseSchema = z.object({
  etag: z.string(),
  version: z.number(),
  source: z.enum(['firestore', 'seed']),
  updated_at: z.string().nullable().optional(),
  updated_by: z.string().nullable().optional(),
  /** Set when the stored document was ignored: the seed is shown and saving replaces it. */
  ignored_document: z.string().nullable().optional(),
  info: companyInfoSchema,
});
export type CompanyInfoResponse = z.infer<typeof companyInfoResponseSchema>;

export const putCompanyInfoBodySchema = z
  .object({ info: companyInfoSchema, reason: z.string().max(500).nullable().optional() })
  .strict();
export type PutCompanyInfoBody = z.infer<typeof putCompanyInfoBodySchema>;

export const companyInfoSaveResponseSchema = z.object({
  etag: z.string(),
  version: z.number(),
  changed_parts: z.array(z.string()),
});
export type CompanyInfoSaveResponse = z.infer<typeof companyInfoSaveResponseSchema>;

export const companyInfoHistoryItemSchema = z.object({
  version: z.number(),
  actor_uid: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  changed_parts: z.array(z.string()).default([]),
  created_at: z.string().nullable().optional(),
});
export const companyInfoHistorySchema = z.object({ items: z.array(companyInfoHistoryItemSchema) });
export type CompanyInfoHistory = z.infer<typeof companyInfoHistorySchema>;

/** GET /api/content/company-info: what the site shows (version 0 = the seed). */
export const publicCompanyInfoSchema = z.object({
  version: z.number(),
  updated_at: z.string().nullable().optional(),
  info: companyInfoSchema,
});
export type PublicCompanyInfo = z.infer<typeof publicCompanyInfoSchema>;
