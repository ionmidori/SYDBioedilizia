---
name: nextjs-seo-geo
description: Guide for implementing advanced SEO and GEO (Generative Engine Optimization) in Next.js 16+ applications. Use when optimizing for search engines and AI answer engines.
---

# Next.js SEO & GEO Optimization

## Overview

This skill provides a comprehensive guide for implementing modern Search Engine Optimization (SEO) and Generative Engine Optimization (GEO) in Next.js 16+ applications using the App Router. It covers metadata management, dynamic sitemaps, robots.txt configuration, and specific strategies for visibility in AI-powered search engines (Perplexity, ChatGPT, Gemini).

## 1. Metadata Management (SEO Core)

Next.js 13+ App Router uses the Metadata API. Do not use `<Head>` components.

### Root Layout (`app/layout.tsx`)

Define the default metadata in the root layout. This serves as a fallback for all pages.

```typescript
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    template: '%s | [Brand Name]',
    default: '[Brand Name] - [Tagline]',
  },
  description: '[155-160 char description]',
  metadataBase: new URL('https://[your-domain].com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: '[Brand Name]',
    description: '[Description]',
    url: 'https://[your-domain].com',
    siteName: '[Brand Name]',
    images: [
      {
        url: '/og-image.jpg', // Must be in public/ folder
        width: 1200,
        height: 630,
      },
    ],
    locale: 'it_IT',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '[Brand Name]',
    description: '[Description]',
    creator: '@[twitter_handle]',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};
```

### Page Metadata (`app/page.tsx`)

Override metadata in individual pages.

```typescript
export const metadata: Metadata = {
  title: '[Page Title]',
  description: '[Page Description]',
  alternates: {
    canonical: '/[page-slug]',
  },
};
```

## 2. Dynamic Sitemaps & Robots

Use Route Handlers to generate these files dynamically based on your content (e.g., database entries).

### `app/robots.ts`

Controls crawler access. See `assets/robots.ts` for a template.

### `app/sitemap.ts`

Generates the XML sitemap. See `assets/sitemap.ts` for a template. Ensure you fetch dynamic routes (blog posts, products) and add them to the array.

## 3. Generative Engine Optimization (GEO)

Optimize for AI answer engines (Perplexity, SearchGPT, Gemini) by providing structured, authoritative, and direct content.

### `public/llms.txt`

The `llms.txt` file is a proposed standard for providing AI-readable documentation about your site. Place it in the `public/` directory.

See `assets/llms.txt` for a template. It should include:
- **Mission**: Concise statement of purpose.
- **Core Entities**: Definitions of key terms/services.
- **Key Resources**: Direct links to high-value pages.

### Content Structure for GEO

1.  **Direct Answers**: Start articles with a clear, concise answer to the user's intent ("In Breve" or "Key Takeaways").
2.  **Structured Data (JSON-LD)**: Use rich schemas.
    - **FAQPage**: For Q&A sections.
    - **Article**: For blog posts (include `author`, `publisher`, `datePublished`).
    - **Organization**: For the homepage/about page.
    - **BreadcrumbList**: For navigation hierarchy.
3.  **Citations**: Use authoritative external links and clear internal linking.
4.  **Semantic HTML**: Use `<article>`, `<section>`, `<header>`, `<footer>`, `<aside>` correctly.

## 4. Verification

1.  **Google Search Console**: Submit your sitemap (`/sitemap.xml`).
2.  **Rich Results Test**: Validate your JSON-LD at [search.google.com/test/rich-results](https://search.google.com/test/rich-results).
3.  **Schema Validator**: Use [validator.schema.org](https://validator.schema.org/).
4.  **Perplexity Discovery**: Search for your brand on Perplexity to see how it answers.

## bundled_resources

- `assets/robots.ts`: Template for `app/robots.ts`.
- `assets/sitemap.ts`: Template for `app/sitemap.ts`.
- `assets/llms.txt`: Template for `public/llms.txt`.
