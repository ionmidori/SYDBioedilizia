import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { Navbar } from '@/components/sections/Navbar';
import { Footer } from '@/components/sections/Footer';
import { BLOG_POSTS } from '@/lib/blog-posts';

export const metadata: Metadata = {
    title: "Blog Ristrutturazioni Roma | SYD Bioedilizia",
    description: "Approfondimenti, guide e consigli sulle ristrutturazioni d'interni, bioedilizia e riqualificazione energetica.",
    alternates: {
        canonical: "/blog",
    },
};


export default function BlogIndexPage() {
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Blog",
        "name": "Blog Ristrutturazioni Roma | SYD Bioedilizia",
        "description": "Approfondimenti, guide e consigli sulle ristrutturazioni d'interni, bioedilizia e riqualificazione energetica.",
        "url": "https://sydbioedilizia.vercel.app/blog",
        "publisher": {
            "@type": "Organization",
            "name": "SYD Bioedilizia",
            "logo": {
                "@type": "ImageObject",
                "url": "https://sydbioedilizia.vercel.app/syd-logo-v2.png"
            }
        },
        "blogPost": BLOG_POSTS.map(post => ({
            "@type": "BlogPosting",
            "headline": post.title,
            "description": post.excerpt,
            "image": post.image,
            "url": `https://sydbioedilizia.vercel.app/blog/${post.id}`
        }))
    };

    return (
        <>
            <Navbar />
            <main className="min-h-screen bg-luxury-bg text-luxury-text py-20 px-4 md:px-8">
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
                <div className="max-w-7xl mx-auto">

                    <header className="mb-16 text-center max-w-3xl mx-auto">
                        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-primary mb-6">
                            Il Blog della Ristrutturazione
                        </h1>
                        <p className="text-xl text-muted-foreground">
                            Idee, approfondimenti tecnici e soluzioni pratiche per trasformare la tua casa con consapevolezza e stile.
                        </p>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {BLOG_POSTS.map((post) => (
                            <Link
                                key={post.id}
                                href={`/blog/${post.id}`}
                                className="group flex flex-col bg-card rounded-2xl overflow-hidden border border-border hover:shadow-xl hover:border-primary/30 transition-all duration-300"
                            >
                                <div className="relative h-56 w-full overflow-hidden bg-muted">
                                    <Image
                                        src={post.image}
                                        alt={post.title}
                                        fill
                                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                    />
                                    <div className="absolute top-4 left-4">
                                        <span className="bg-background/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold text-primary">
                                            {post.category}
                                        </span>
                                    </div>
                                </div>

                                <div className="p-6 flex flex-col flex-grow">
                                    <div className="text-sm text-muted-foreground mb-2 font-medium">
                                        {post.date}
                                    </div>
                                    <h2 className="text-xl font-bold mb-3 text-card-foreground group-hover:text-primary transition-colors line-clamp-2">
                                        {post.title}
                                    </h2>
                                    <p className="text-muted-foreground mb-6 flex-grow line-clamp-3 leading-relaxed text-sm">
                                        {post.excerpt}
                                    </p>

                                    <div className="mt-auto flex items-center text-primary font-semibold text-sm">
                                        Leggi l&apos;articolo
                                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>

                </div>
            </main>
            <Footer />
        </>
    );
}
