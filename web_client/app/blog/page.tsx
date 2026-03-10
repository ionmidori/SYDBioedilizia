import Link from 'next/link';
import { Metadata } from 'next';
import { getAllBlogPosts } from '@/lib/blog';

export const metadata: Metadata = {
  title: 'Blog - Tendenze e Consigli per la Ristrutturazione | Renovation Next',
  description: 'Scopri le ultime tendenze, i costi e i consigli per la ristrutturazione della tua casa. Articoli aggiornati sulle best practice del 2026.',
  alternates: {
    canonical: '/blog',
  },
};

export default function BlogIndexPage() {
  const posts = getAllBlogPosts();

  // JSON-LD for the Blog Index (CollectionPage or Blog)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Blog di Renovation Next',
    url: 'https://www.renovation-next.com/blog',
    description: 'Tendenze e consigli per ristrutturare casa.',
    blogPost: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.description,
      author: {
        '@type': 'Organization',
        name: post.author,
      },
      datePublished: post.datePublished,
      url: `https://www.renovation-next.com/blog/${post.slug}`,
    })),
  };

  return (
    <main className="container mx-auto px-4 py-12 max-w-4xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground mb-4">
          Il nostro Blog
        </h1>
        <p className="text-xl text-muted-foreground">
          Consigli, tendenze e guide pratiche per la ristrutturazione della tua casa nel 2026.
        </p>
      </header>

      <div className="grid gap-8">
        {posts.map((post) => (
          <article
            key={post.slug}
            className="group relative flex flex-col items-start justify-between rounded-2xl border border-border p-6 shadow-sm transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-x-4 text-xs mb-4">
              <time dateTime={post.datePublished} className="text-muted-foreground">
                {post.datePublished}
              </time>
            </div>
            <div className="group relative">
              <h2 className="mt-3 text-2xl font-semibold leading-6 text-foreground group-hover:text-primary">
                <Link href={`/blog/${post.slug}`}>
                  <span className="absolute inset-0" />
                  {post.title}
                </Link>
              </h2>
              <p className="mt-5 line-clamp-3 text-sm leading-6 text-muted-foreground">
                {post.description}
              </p>
            </div>
            <div className="relative mt-8 flex items-center gap-x-4">
              <div className="text-sm leading-6">
                <p className="font-semibold text-foreground">
                  <span className="absolute inset-0" />
                  {post.author}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
