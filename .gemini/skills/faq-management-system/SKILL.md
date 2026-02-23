---
name: faq-management-system
description: Guide for creating FAQ sections optimized for SEO (Google) and GEO (AI/LLM). Includes Next.js implementation, Schema Markup, and Content Strategy. Use when building or optimizing Frequently Asked Questions pages.
---

# FAQ Management System

## Overview

This skill provides a comprehensive guide for building high-performance FAQ sections in Next.js 16 applications, optimized for both traditional Search Engine Optimization (SEO) and Generative Engine Optimization (GEO). It covers architectural patterns, content strategy, and technical implementation.

## 1. Content Strategy (GEO Optimized)

To be cited by AI models (Gemini, ChatGPT, Perplexity), your FAQ content must follow the "Answer First" principle.

### The "Answer First" Pattern
Every answer should begin with a direct, factual statement of 40-80 words that fully addresses the user's intent.

**Do:**
> **Q:** Quanto costa ristrutturare un bagno?
> **A:** Il costo medio per ristrutturare un bagno completo (4-6 mq) varia dai **3.500€ ai 6.000€** chiavi in mano. Questo include demolizione, rifacimento impianti idraulici ed elettrici, posa rivestimenti e sanitari standard. I tempi di esecuzione sono di circa 5-7 giorni lavorativi.

**Don't:**
> **Q:** Quanto costa ristrutturare un bagno?
> **A:** Dipende da molti fattori. Noi di SYD offriamo preventivi personalizzati basati sulle tue esigenze specifiche... (Vago, non risponde)

### Structure for AI
- **Lists**: Use bullet points for steps or items. AI parsers love structure.
- **Data**: Be specific with numbers, ranges, and technical specs.
- **Natural Language Questions**: Phrase questions as users actually ask them (e.g., "Come funziona..." instead of "Funzionamento").

## 2. Technical Architecture (Next.js 16)

Use a **Single Source of Truth** pattern. Define FAQ data in a TypeScript file (`lib/faq-data.ts`) to feed both the UI (React Components) and the Metadata (JSON-LD). This prevents content drift.

### Data Structure (`lib/faq-data.ts`)

```typescript
export interface FAQItem {
  question: string;
  answer: string; // Markdown or HTML supported
  category: string;
  slug: string; // For anchor links
}

export const FAQ_DATA: FAQItem[] = [
  {
    question: "Quanto costa una ristrutturazione completa?",
    answer: "Il costo medio è di **800-1.200€ al mq**...",
    category: "Costi",
    slug: "costo-ristrutturazione-mq"
  },
  // ...
];
```

### Page Implementation (`app/faq/page.tsx`)

Render the FAQ list server-side (RSC) for optimal SEO. Inject JSON-LD using the `script` tag.

```tsx
import { FAQ_DATA } from '@/lib/faq-data';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Domande Frequenti (FAQ) - SYD Renovation',
  description: 'Risposte alle domande più comuni su ristrutturazioni, costi e tempi.',
};

export default function FAQPage() {
  // Generate JSON-LD Structured Data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_DATA.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer, // Ensure HTML/Markdown is stripped or formatted correctly
      },
    })),
  };

  return (
    <section className="container py-12">
      <h1 className="text-4xl font-bold mb-8">Domande Frequenti</h1>
      
      {/* JSON-LD Script for Google/AI */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="grid gap-6">
        {FAQ_DATA.map((faq) => (
          <div key={faq.slug} id={faq.slug} className="scroll-mt-20 border rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-2">{faq.question}</h3>
            <div className="prose dark:prose-invert" dangerouslySetInnerHTML={{ __html: faq.answer }} />
          </div>
        ))}
      </div>
    </section>
  );
}
```

## 3. Advanced Features

### Internal Search
For >10 items, implement a client-side search (using `useSearchParams` or simple state filter) to help users find answers quickly.

### Anchor Links
Ensure every FAQ item has an `id` attribute matching its slug. This allows deep linking (e.g., `syd.com/faq#costi`) which is excellent for sharing and SEO sitelinks.

### Accordion UI
Use an Accordion component (like Shadcn/UI Accordion) to keep the page clean, but ensure the content is present in the DOM for crawlers (avoid `display: none` techniques that hide content from bots if possible, though Google renders JS well now). Standard accessible accordions (`details`/`summary` or Radix UI) are best practice.
