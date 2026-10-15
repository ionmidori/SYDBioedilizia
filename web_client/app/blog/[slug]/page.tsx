import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/sections/Navbar";
import { Footer } from "@/components/sections/Footer";
import { BlogBackButton } from "@/components/blog/BlogBackButton";
import { ArticleBody } from "@/components/blog/ArticleBody";
import { BLOG_POSTS, getBlogPost } from "@/lib/blog";
import {
  blogPostJsonLd,
  blogPostMetadata,
  serializeJsonLd,
} from "@/lib/blog/seo";

type Params = Promise<{ slug: string }>;

/** Every article is prerendered at build time; unknown slugs are a static 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const post = getBlogPost((await params).slug);
  return post ? blogPostMetadata(post) : {};
}

export default async function BlogArticlePage({ params }: { params: Params }) {
  const post = getBlogPost((await params).slug);
  if (!post) notFound();

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-luxury-bg text-luxury-text py-12 px-4 md:px-8">
        <script
          type="application/ld+json"
          // Inert JSON built from typed data; `<` is escaped by serializeJsonLd.
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(blogPostJsonLd(post)),
          }}
        />

        <div className="max-w-4xl mx-auto">
          <BlogBackButton />

          <article className="prose prose-invert lg:prose-lg max-w-none">
            <header className="mb-10 not-prose">
              {post.badge && (
                <div className="inline-block bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
                  {post.badge}
                </div>
              )}
              <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-primary mb-4 leading-tight">
                {post.title}
              </h1>
              <p className="text-xl text-muted-foreground font-medium max-w-2xl">
                {post.subtitle}
              </p>
            </header>

            <ArticleBody blocks={post.body} />

            <section className="mt-16 not-prose border-t border-border pt-12">
              <h2 className="text-2xl font-bold mb-8 text-foreground">
                {post.faqHeading}
              </h2>
              <div className="space-y-4">
                {post.faq.map((faq) => (
                  <div
                    key={faq.question}
                    className="bg-card p-5 rounded-lg border border-border"
                  >
                    <h3 className="font-bold text-primary mb-2">
                      {faq.question}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
}
