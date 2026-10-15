import fs from "fs";
import path from "path";
import { BLOG_POSTS, getBlogPost } from "@/lib/blog";
import type { BlogBlock } from "@/lib/blog/types";

/**
 * Integrity of the blog registry: it feeds /blog, /blog/[slug] (static params)
 * and sitemap.xml, so a malformed entry would ship a broken or invisible article.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const inlineTexts = (block: BlogBlock): string[] => {
  switch (block.type) {
    case "ul":
    case "takeaways":
      return block.items;
    case "keyPoints":
      return block.items.flatMap((i) => [i.title, i.text]);
    case "callout":
      return [block.title ?? "", block.text];
    default:
      return [block.text];
  }
};

describe("BLOG_POSTS", () => {
  it("has unique, URL-safe slugs", () => {
    const slugs = BLOG_POSTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    slugs.forEach((slug) => expect(slug).toMatch(SLUG));
  });

  it("is ordered newest first", () => {
    const dates = BLOG_POSTS.map((p) => p.datePublished);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("no longer ships a hand-written page per article", () => {
    const blogDir = path.resolve(__dirname, "..", "..", "..", "app", "blog");
    const dirs = fs
      .readdirSync(blogDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());
    expect(dirs.map((d) => d.name)).toEqual(["[slug]"]);
  });

  it("resolves every slug and nothing else", () => {
    BLOG_POSTS.forEach((p) => expect(getBlogPost(p.slug)).toBe(p));
    expect(getBlogPost("does-not-exist")).toBeUndefined();
  });

  describe.each(BLOG_POSTS.map((p) => [p.slug, p] as const))(
    "%s",
    (_slug, post) => {
      it("has valid dates", () => {
        expect(post.datePublished).toMatch(ISO_DATE);
        expect(Number.isNaN(Date.parse(post.datePublished))).toBe(false);
        if (post.dateModified) {
          expect(post.dateModified).toMatch(ISO_DATE);
          expect(post.dateModified >= post.datePublished).toBe(true);
        }
      });

      it("has the content every article needs", () => {
        expect(post.title.trim()).not.toBe("");
        expect(post.seo.description.trim()).not.toBe("");
        expect(post.body.length).toBeGreaterThan(0);
        expect(post.faq.length).toBeGreaterThan(0);
        expect(post.image).toMatch(/^https:\/\//);
      });

      it("contains no literal HTML entities or markup", () => {
        const texts = [
          post.title,
          post.subtitle,
          post.excerpt,
          ...Object.values(post.seo),
          ...post.body.flatMap(inlineTexts),
          ...post.faq.flatMap((f) => [f.question, f.answer]),
        ];
        texts.forEach((t) => {
          expect(t).not.toMatch(/&(apos|quot|amp|lt|gt);/);
          expect(t).not.toMatch(/<\/?[a-z][^>]*>/i);
        });
      });

      it("has balanced **bold** markers", () => {
        post.body
          .flatMap(inlineTexts)
          .forEach((t) => expect((t.match(/\*\*/g) ?? []).length % 2).toBe(0));
      });
    },
  );
});
