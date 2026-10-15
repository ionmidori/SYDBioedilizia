/**
 * Blog content model.
 *
 * Articles are typed data rendered by components/blog/ArticleBody.tsx — never
 * raw HTML, never dangerouslySetInnerHTML. Inline text may contain `**bold**`
 * markers and `\n` line breaks (see components/content/RichInline.tsx).
 *
 * Titles and descriptions default to one another (see lib/blog/seo.ts); an
 * article only sets an override where its SEO copy deliberately differs.
 */

/** Inline text: `**bold**` segments and `\n` line breaks. */
export type BlogInline = string;

export type KeyPointIcon = "check" | "file" | "alert";

export type BlogBlock =
  | { type: "lead"; text: BlogInline }
  | { type: "h2"; text: BlogInline }
  | { type: "h3"; text: BlogInline }
  | { type: "p"; text: BlogInline }
  | { type: "ul"; items: BlogInline[] }
  | {
      type: "callout";
      tone: "warning" | "info";
      title?: BlogInline;
      text: BlogInline;
    }
  /** Card grid of 4 highlights with an icon each. */
  | {
      type: "keyPoints";
      heading: string;
      items: { icon: KeyPointIcon; title: string; text: BlogInline }[];
    }
  /** Bordered "in short" list, items usually lead with a **label:**. */
  | { type: "takeaways"; heading: string; items: BlogInline[] };

export interface BlogFaq {
  question: string;
  /** Plain text: used verbatim on the page and in the FAQPage JSON-LD. */
  answer: string;
}

export interface BlogSeo {
  /** <title>; defaults to `title`. */
  title?: string;
  /** Meta description (required). */
  description: string;
  /** og:title; defaults to the resolved SEO title. */
  ogTitle?: string;
  /** og:description; defaults to `description`. */
  ogDescription?: string;
  /** Article.headline in JSON-LD; defaults to `title`. */
  schemaHeadline?: string;
  /** Article.description in JSON-LD; defaults to `description`. */
  schemaDescription?: string;
}

export interface BlogPost {
  /** URL segment: /blog/<slug>. */
  slug: string;
  /** On-page <h1>. */
  title: string;
  /** Header line under the <h1>. */
  subtitle: string;
  /** Header badge; some articles have none. */
  badge?: string;
  /** Category shown on the /blog index card. */
  category: string;
  /** Summary shown on the /blog index card and in the Blog JSON-LD. */
  excerpt: string;
  /** Cover image (index card), remote URL allowed by next.config images. */
  image: string;
  /** Display date on the index card, e.g. "10 Mar 2026". */
  date: string;
  /** ISO date (YYYY-MM-DD). */
  datePublished: string;
  /** ISO date (YYYY-MM-DD); defaults to `datePublished`. */
  dateModified?: string;
  /** Last BreadcrumbList item. */
  breadcrumbLabel: string;
  seo: BlogSeo;
  body: BlogBlock[];
  faqHeading: string;
  faq: BlogFaq[];
}
