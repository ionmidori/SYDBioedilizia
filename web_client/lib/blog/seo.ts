import type { Metadata } from "next";
import { STRUCTURED_DATA_LOGO } from "@/lib/brand";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import type { BlogPost } from "./types";

/**
 * SEO for blog articles: resolved titles/descriptions, Next metadata and the
 * JSON-LD graph (Article + BreadcrumbList + FAQPage).
 *
 * Every absolute URL derives from SITE_URL — the articles used to hard-code
 * https://sydbioedilizia.it (a different host from the canonical, sitemap and
 * index) and a publisher logo at /images/logo.png that does not exist.
 */

export const BLOG_LOGO_URL = `${SITE_URL}${STRUCTURED_DATA_LOGO.url}`;

/** Articles carry a date only; OG publishedTime keeps the historical 08:00 UTC. */
const toIsoDateTime = (date: string) => `${date}T08:00:00.000Z`;

export function articleUrl(post: BlogPost): string {
  return `${SITE_URL}/blog/${post.slug}`;
}

export function resolveSeo(post: BlogPost) {
  const title = post.seo.title ?? post.title;
  return {
    title,
    description: post.seo.description,
    ogTitle: post.seo.ogTitle ?? title,
    ogDescription: post.seo.ogDescription ?? post.seo.description,
    schemaHeadline: post.seo.schemaHeadline ?? post.title,
    schemaDescription: post.seo.schemaDescription ?? post.seo.description,
    dateModified: post.dateModified ?? post.datePublished,
  };
}

export function blogPostMetadata(post: BlogPost): Metadata {
  const seo = resolveSeo(post);
  return {
    title: seo.title,
    description: seo.description,
    openGraph: {
      title: seo.ogTitle,
      description: seo.ogDescription,
      type: "article",
      locale: "it_IT",
      siteName: SITE_NAME,
      url: articleUrl(post),
      publishedTime: toIsoDateTime(post.datePublished),
      modifiedTime: toIsoDateTime(seo.dateModified),
      authors: [post.author ?? SITE_NAME],
      images: [{ url: post.image, alt: post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.ogTitle,
      description: seo.ogDescription,
      images: [post.image],
    },
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
  };
}

export function blogPostJsonLd(post: BlogPost) {
  const seo = resolveSeo(post);
  const url = articleUrl(post);
  const organization = {
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
  };

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: seo.schemaHeadline,
        description: seo.schemaDescription,
        image: post.image,
        author: post.author
          ? { "@type": "Person", name: post.author }
          : organization,
        publisher: {
          ...organization,
          logo: { "@type": "ImageObject", url: BLOG_LOGO_URL },
        },
        datePublished: post.datePublished,
        dateModified: seo.dateModified,
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          {
            "@type": "ListItem",
            position: 2,
            name: "Blog",
            item: `${SITE_URL}/blog`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: post.breadcrumbLabel,
            item: url,
          },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: post.faq.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      },
    ],
  };
}

/**
 * Serialise JSON-LD for an inline <script>. `<` is escaped so content can never
 * close the script element (`</script>`) — the payload stays inert JSON.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
