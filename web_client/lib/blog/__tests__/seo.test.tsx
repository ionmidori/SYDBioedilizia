import { render, screen } from "@testing-library/react";
import { ArticleBody } from "@/components/blog/ArticleBody";
import { BLOG_POSTS } from "@/lib/blog";
import { blogPostJsonLd } from "@/lib/blog/seo";
import { SITE_NAME } from "@/lib/site";

describe("blogPostJsonLd", () => {
  it("emits Organization author when post.author is omitted", () => {
    const basePost = BLOG_POSTS[0];
    const postWithoutAuthor = { ...basePost, author: undefined };
    const graph = blogPostJsonLd(postWithoutAuthor)["@graph"];
    const article = graph.find((node) => node["@type"] === "Article")!;

    expect(article.author).toEqual({
      "@type": "Organization",
      name: SITE_NAME,
      url: expect.any(String),
    });
  });

  it("emits Person author when post.author is provided", () => {
    const postWithAuthor = { ...BLOG_POSTS[0], author: "Arch. Marco Rossi" };
    const graph = blogPostJsonLd(postWithAuthor)["@graph"];
    const article = graph.find((node) => node["@type"] === "Article")!;

    expect(article.author).toEqual({
      "@type": "Person",
      name: "Arch. Marco Rossi",
    });
  });
});

describe("ArticleBody heading levels", () => {
  it("renders keyPoints and takeaways headings as h2", () => {
    render(
      <ArticleBody
        blocks={[
          {
            type: "keyPoints",
            heading: "Punti Chiave",
            items: [{ icon: "check", title: "Punto 1", text: "Dettaglio 1" }],
          },
          {
            type: "takeaways",
            heading: "In Sintesi",
            items: ["**Voce:** valore"],
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { level: 2, name: /Punti Chiave/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /In Sintesi/ })).toBeInTheDocument();
  });
});

