/**
 * Characterization helpers for blog articles.
 *
 * Captures what a reader and a crawler get from a rendered article: the
 * semantic structure (tag + normalised text, in document order), the visible
 * text, and the JSON-LD graph. The fixtures in ../__fixtures__ were recorded
 * from the hand-written pages before the data-driven refactor; the new route
 * must reproduce them (see blog-characterization.test.tsx).
 */

const STRUCTURAL_TAGS = new Set(["H1", "H2", "H3", "H4", "P", "LI", "STRONG"]);

export const normalise = (text: string): string =>
  text.replace(/\s+/g, " ").trim();

export interface ArticleCapture {
  structure: string[];
  text: string;
  jsonLd: unknown;
}

export function captureArticle(container: HTMLElement): ArticleCapture {
  const main = container.querySelector("main");
  if (!main) throw new Error("article has no <main>");

  const structure: string[] = [];
  main.querySelectorAll("*").forEach((el) => {
    if (STRUCTURAL_TAGS.has(el.tagName)) {
      const text = normalise(el.textContent ?? "");
      if (text) structure.push(`${el.tagName.toLowerCase()}:${text}`);
    }
  });

  const ld = container.querySelector('script[type="application/ld+json"]');
  // Visible text only: <script> content (the JSON-LD) is not read by anyone.
  const visible = main.cloneNode(true) as HTMLElement;
  visible.querySelectorAll("script").forEach((s) => s.remove());
  return {
    structure,
    text: normalise(visible.textContent ?? ""),
    jsonLd: ld ? JSON.parse(ld.innerHTML) : null,
  };
}
