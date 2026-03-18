---
name: faq-management-system
description: FAQ pages optimized for SEO and GEO (AI citation). Use when building or updating FAQ sections with JSON-LD structured data and category-based navigation.
---

# FAQ Management System

Server-rendered FAQ pages with JSON-LD structured data, optimized for Google Search and AI citation (GEO).

## SYD Implementation

| Component | File |
|-----------|------|
| Data source | `lib/faq-data.ts` — `FAQ_DATA`, `FAQItem`, `CATEGORY_ICONS` |
| Page (RSC) | `app/faq/page.tsx` — server component with JSON-LD |
| Card component | `components/faq/FAQItem.tsx` — `FAQItemCard` |

## Data Structure (Single Source of Truth)

All FAQ content lives in `lib/faq-data.ts`. Both the UI and JSON-LD read from the same array:

```typescript
export interface FAQItem {
  question: string;
  answer: string;  // HTML string
  category: "Costi & Tempi" | "Permessi & Normative" | "Design & AI" | "Servizi SYD";
  slug: string;    // Anchor link target
}

export const CATEGORY_ICONS = {
  "Costi & Tempi": "Coins",
  "Permessi & Normative": "FileText",
  "Design & AI": "Sparkles",
  "Servizi SYD": "Wrench",
} as const;
```

## JSON-LD Structured Data

Inject FAQPage schema for Google Rich Results:

```tsx
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_DATA.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: { '@type': 'Answer', text: faq.answer },
  })),
};

<script type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
```

## GEO Content Rules ("Answer First")

For AI models to cite your FAQ:

1. **Lead with a direct answer** (40–80 words) containing specific numbers/ranges
2. **Use structured lists** for steps or factors — AI parsers extract these reliably
3. **Natural-language questions** — phrase as users actually ask ("Quanto costa..." not "Informazioni costi")

**Good**: "Il costo medio per ristrutturare un bagno (4-6 mq) varia dai **3.500€ ai 6.000€** chiavi in mano."
**Bad**: "Dipende da molti fattori. Contattaci per un preventivo personalizzato."

## Page Structure

The FAQ page is a **Server Component** (no `'use client'`):

- Category filtering via Lucide icon map
- Anchor links per slug (`/faq#costo-ristrutturazione-mq`)
- Full SEO metadata with OpenGraph + canonical
- ChatWidget embedded for follow-up questions

## Adding New FAQs

1. Add entry to `FAQ_DATA` in `lib/faq-data.ts`
2. Choose existing category or add new one (update `CATEGORY_ICONS` + `FAQItem` union)
3. Write answer following "Answer First" pattern
4. Verify JSON-LD in Google Rich Results Test

## Checklist

- [ ] Answer starts with direct factual statement (40-80 words)
- [ ] Specific numbers/ranges included (not "depends on many factors")
- [ ] Category assigned with matching icon
- [ ] Slug is URL-safe and descriptive
- [ ] JSON-LD renders valid FAQPage schema
