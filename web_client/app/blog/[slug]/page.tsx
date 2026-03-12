import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { getBlogPostBySlug, getBlogSlugs } from '@/lib/blog';
import { BlogBackButton } from '@/components/blog/BlogBackButton';

type Params = {
  slug: string;
};

// Next.js requires params to be an asynchronous promise in Next.js 15+ Page components 
// (or we can type it as a Promise and use React.use(params) or await params).
// Let's use the standard Next 15+ approach.

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);

  if (!post) {
    return {
      title: 'Post non trovato',
    };
  }

  return {
    title: `${post.title} | Renovation Next`,
    description: post.description,
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.datePublished,
      authors: [post.author],
    },
  };
}

export async function generateStaticParams() {
  const slugs = getBlogSlugs();
  return slugs.map((slug) => ({
    slug,
  }));
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    author: {
      '@type': 'Organization',
      name: post.author,
    },
    datePublished: post.datePublished,
    url: `https://www.renovation-next.com/blog/${post.slug}`,
  };

  return (
    <main className="min-h-screen bg-luxury-bg text-luxury-text py-12 px-4 md:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-4xl mx-auto">
        <BlogBackButton />
      <article className="prose prose-invert lg:prose-lg max-w-none">
      <header className="mb-10 not-prose text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-6 leading-tight">
          {post.title}
        </h1>
        <div className="flex justify-center items-center gap-4 text-sm text-muted-foreground">
          <time dateTime={post.datePublished}>{post.datePublished}</time>
          <span>&bull;</span>
          <span>{post.author}</span>
        </div>
      </header>

      <div className="mt-8">
        <ReactMarkdown>{post.content}</ReactMarkdown>
      </div>
      </article>
      </div>
    </main>
  );
}
