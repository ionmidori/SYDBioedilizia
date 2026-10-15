/**
 * Blog registry — single source of truth for /blog, /blog/[slug] and the sitemap.
 * To publish an article: add lib/blog/posts/<slug>.ts and list it here (newest first).
 */
import type { BlogPost } from "./types";
import { bonusRistrutturazioni20252026 } from "./posts/bonus-ristrutturazioni-2025-2026";
import { costiRistrutturazioneCasa2026 } from "./posts/costi-ristrutturazione-casa-2026";
import { isolamentoAcusticoInterni } from "./posts/isolamento-acustico-interni";
import { pavimentiResinaVantaggi } from "./posts/pavimenti-resina-vantaggi";
import { smartRemodelRistrutturazioneSenzaDemolire } from "./posts/smart-remodel-ristrutturazione-senza-demolire";
import { tendenzeBagno2026 } from "./posts/tendenze-bagno-2026";
import { tendenzeLayoutInterni2026 } from "./posts/tendenze-layout-interni-2026";
import { umiditaRisalitaRoma } from "./posts/umidita-risalita-roma";

export type { BlogBlock, BlogFaq, BlogPost, BlogSeo } from "./types";

/** Newest first: the order of the /blog index. */
export const BLOG_POSTS: readonly BlogPost[] = [
  costiRistrutturazioneCasa2026,
  smartRemodelRistrutturazioneSenzaDemolire,
  tendenzeLayoutInterni2026,
  bonusRistrutturazioni20252026,
  umiditaRisalitaRoma,
  tendenzeBagno2026,
  isolamentoAcusticoInterni,
  pavimentiResinaVantaggi,
];

const BY_SLUG = new Map(BLOG_POSTS.map((post) => [post.slug, post]));

export function getBlogPost(slug: string): BlogPost | undefined {
  return BY_SLUG.get(slug);
}
