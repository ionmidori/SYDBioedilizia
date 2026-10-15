/**
 * Characterization helpers for blog articles.
 *
 * Captures what a reader and a crawler get from a rendered article: the
 * semantic structure (tag + normalised text, in document order), the visible
 * text, and the JSON-LD graph. The fixtures in ../__fixtures__ were recorded
 * from the hand-written pages before the data-driven refactor; the new route
 * must reproduce them (see blog-characterization.test.tsx).
 *
 * Line breaks matter to readers but vanish from `textContent`, so every <br>
 * is replaced by the visible marker BR_MARK before reading text.
 */

const STRUCTURAL_TAGS = new Set(["H1", "H2", "H3", "H4", "P", "LI", "STRONG"]);

export const BR_MARK = "⏎";

export const normalise = (text: string): string =>
  text.replace(/\s+/g, " ").trim();

export interface ArticleCapture {
  structure: string[];
  text: string;
  jsonLd: unknown;
}

export function captureArticle(container: HTMLElement): ArticleCapture {
  const source = container.querySelector("main");
  if (!source) throw new Error("article has no <main>");

  const ld = container.querySelector('script[type="application/ld+json"]');

  // Work on a copy: <script> content (the JSON-LD) is not visible text, and
  // <br> must become text to survive textContent.
  const main = source.cloneNode(true) as HTMLElement;
  main.querySelectorAll("script").forEach((s) => s.remove());
  main
    .querySelectorAll("br")
    .forEach((br) => br.replaceWith(document.createTextNode(BR_MARK)));

  const structure: string[] = [];
  main.querySelectorAll("*").forEach((el) => {
    if (STRUCTURAL_TAGS.has(el.tagName)) {
      const text = normalise(el.textContent ?? "");
      if (text) structure.push(`${el.tagName.toLowerCase()}:${text}`);
    }
  });

  return {
    structure,
    text: normalise(main.textContent ?? ""),
    jsonLd: ld ? JSON.parse(ld.innerHTML) : null,
  };
}
