/**
 * Characterization: the data-driven /blog/[slug] route reproduces the former
 * hand-written pages (fixtures recorded from them before the refactor).
 *
 * Intended differences, and only these, are normalised before comparing:
 *  1. Literal HTML entities (&apos; &quot; &amp;) that leaked into the visible
 *     FAQ text are decoded — readers used to see "sull&apos;esistente".
 *  2. FAQ questions are <h3> (were <h4>, skipping a level under the <h2>).
 *  3. Callout text is wrapped in a <p> (one article had it bare in a <div>).
 *  4. JSON-LD URLs use COMPANY.url (were https://sydbioedilizia.it) and a
 *     publisher logo that exists (was /images/logo.png, a 404).
 */
import fs from "fs";
import path from "path";
import { render } from "@testing-library/react";
import BlogArticlePage, {
  generateMetadata,
  generateStaticParams,
} from "@/app/blog/[slug]/page";
import { BLOG_POSTS } from "@/lib/blog";
import { BLOG_LOGO_URL } from "@/lib/blog/seo";
import { COMPANY } from "@/lib/company";
import { captureArticle, normalise } from "../__test-utils__/capture";

jest.mock("@/components/sections/Navbar", () => ({ Navbar: () => null }));
jest.mock("@/components/sections/Footer", () => ({ Footer: () => null }));
jest.mock("@/components/blog/BlogBackButton", () => ({
  BlogBackButton: () => null,
}));

interface Fixture {
  metadata: Record<string, string | undefined>;
  structure: string[];
  text: string;
  jsonLd: { "@graph": Array<Record<string, unknown>> };
}

const fixturesDir = path.resolve(__dirname, "..", "__fixtures__");
const loadFixture = (slug: string): Fixture =>
  JSON.parse(fs.readFileSync(path.join(fixturesDir, `${slug}.json`), "utf8"));

const decode = (s: string) =>
  s
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
const plain = (s: string) => normalise(s.replace(/\*\*/g, ""));

async function renderArticle(slug: string) {
  const params = Promise.resolve({ slug });
  const element = await BlogArticlePage({ params });
  const { container } = render(element);
  return {
    capture: captureArticle(container),
    metadata: await generateMetadata({ params }),
  };
}

describe("blog route", () => {
  it("prerenders exactly the registered articles", () => {
    expect(generateStaticParams()).toEqual(
      BLOG_POSTS.map((p) => ({ slug: p.slug })),
    );
  });
});

describe.each(BLOG_POSTS.map((p) => [p.slug, p] as const))(
  "characterization: %s",
  (slug, post) => {
    const fixture = loadFixture(slug);
    const faqQuestions = new Set(post.faq.map((f) => normalise(f.question)));
    const calloutTexts = new Set(
      post.body.flatMap((b) =>
        b.type === "callout" ? [`p:${plain(b.text)}`] : [],
      ),
    );

    const normaliseStructure = (entries: string[]) =>
      entries
        .map(decode)
        .map((e) =>
          e.startsWith("h4:") && faqQuestions.has(e.slice(3))
            ? `h3:${e.slice(3)}`
            : e,
        )
        .filter((e) => !calloutTexts.has(e));

    it("keeps the same semantic structure and visible text", async () => {
      const { capture } = await renderArticle(slug);
      expect(normaliseStructure(capture.structure)).toEqual(
        normaliseStructure(fixture.structure),
      );
      expect(capture.text).toBe(decode(fixture.text));
    });

    it("keeps the same SEO metadata", async () => {
      const { metadata } = await renderArticle(slug);
      const og = metadata.openGraph as Record<string, unknown>;
      expect(metadata.title).toBe(fixture.metadata.title);
      expect(metadata.description).toBe(fixture.metadata.description);
      expect(og.title).toBe(fixture.metadata.ogTitle);
      expect(og.description).toBe(fixture.metadata.ogDescription);
      expect(metadata.alternates?.canonical).toBe(fixture.metadata.canonical);
      if (fixture.metadata.publishedTime)
        expect(og.publishedTime).toBe(fixture.metadata.publishedTime);
    });

    it("keeps the JSON-LD content, on the canonical host", async () => {
      const { capture } = await renderArticle(slug);
      const graph = (capture.jsonLd as Fixture["jsonLd"])["@graph"];
      const old = fixture.jsonLd["@graph"];
      const byType = (g: Array<Record<string, unknown>>, t: string) =>
        g.find((n) => n["@type"] === t)!;

      const article = byType(graph, "Article");
      const oldArticle = byType(old, "Article");
      expect(article.headline).toBe(oldArticle.headline);
      if (oldArticle.description)
        expect(article.description).toBe(oldArticle.description);
      expect(article.datePublished).toBe(oldArticle.datePublished);
      expect(article.dateModified).toBe(oldArticle.dateModified);
      expect((article.publisher as { logo: { url: string } }).logo.url).toBe(
        BLOG_LOGO_URL,
      );

      const crumbs = byType(graph, "BreadcrumbList").itemListElement as Array<{
        name: string;
        item: string;
      }>;
      const oldCrumbs = byType(old, "BreadcrumbList").itemListElement as Array<{
        name: string;
      }>;
      expect(crumbs.map((c) => c.name)).toEqual(oldCrumbs.map((c) => c.name));
      expect(crumbs[2].item).toBe(`${COMPANY.url}/blog/${slug}`);

      const qa = (g: Array<Record<string, unknown>>) =>
        (
          byType(g, "FAQPage").mainEntity as Array<{
            name: string;
            acceptedAnswer: { text: string };
          }>
        ).map((q) => [decode(q.name), decode(q.acceptedAnswer.text)]);
      expect(qa(graph)).toEqual(qa(old));

      const serialized = JSON.stringify(capture.jsonLd);
      expect(serialized).not.toContain("sydbioedilizia.it");
      expect(serialized).not.toMatch(/&(apos|quot|amp);/);
    });
  },
);
