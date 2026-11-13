import type { Metadata } from "next";
import Image from "next/image";
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
import { SITE_NAME } from "@/lib/site";

function formatIsoDateIt(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

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
      <main className="min-h-screen bg-canvas text-ink py-12 px-4 md:px-8">
        <script
          type="application/ld+json"
          // Inert JSON built from typed data; `<` is escaped by serializeJsonLd.
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(blogPostJsonLd(post)),
          }}
        />

        <div className="max-w-4xl mx-auto">
          <BlogBackButton />

          <article className="prose lg:prose-lg max-w-3xl mx-auto">
            <header className="mb-10 not-prose">
              {post.badge && (
                <div className="inline-block px-3 py-1 rounded-full bg-primary-subtle border border-primary/20 text-primary-ink text-xs font-bold uppercase tracking-wider mb-4">
                  {post.badge}
                </div>
              )}
              <h1 className="text-3xl md:text-5xl font-serif font-bold tracking-tight mb-4 leading-tight text-ink">
                {post.title}
              </h1>
              <p className="text-xl text-ink-muted font-light max-w-2xl">
                {post.subtitle}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                <span>Di {post.author ?? SITE_NAME}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={post.datePublished}>{post.date}</time>
                {post.dateModified && post.dateModified > post.datePublished && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      Aggiornato:{" "}
                      <time dateTime={post.dateModified}>
                        {formatIsoDateIt(post.dateModified)}
                      </time>
                    </span>
                  </>
                )}
              </div>
              <div className="relative aspect-[1200/630] w-full overflow-hidden rounded-2xl border border-line bg-surface mt-6">
                <Image
                  src={post.image}
                  alt={post.title}
                  width={1200}
                  height={630}
                  priority
                  sizes="(max-width: 768px) 100vw, 768px"
                  className="h-full w-full object-cover"
                />
              </div>
            </header>

            <ArticleBody blocks={post.body} />

            <section className="mt-16 not-prose border-t border-line pt-12">
              <h2 className="text-2xl font-serif font-bold mb-8 text-ink">
                {post.faqHeading}
              </h2>
              <div className="space-y-4">
                {post.faq.map((faq) => (
                  <div
                    key={faq.question}
                    className="bg-surface p-5 rounded-lg border border-line"
                  >
                    <h3 className="font-bold mb-2">
                      {faq.question}
                    </h3>
                    <p className="text-sm text-ink-muted">
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
