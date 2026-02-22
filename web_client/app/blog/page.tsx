import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { Navbar } from '@/components/sections/Navbar';
import { Footer } from '@/components/sections/Footer';

export const metadata: Metadata = {
    title: "Blog Ristrutturazioni Roma | SYD Bioedilizia",
    description: "Approfondimenti, guide e consigli sulle ristrutturazioni d'interni, bioedilizia e riqualificazione energetica.",
    alternates: {
        canonical: "/blog",
    },
};

const BLOG_POSTS = [
    {
        id: 'bonus-ristrutturazioni-2025-2026',
        title: "Bonus Ristrutturazioni 2026: La Guida Completa senza sorprese",
        excerpt: "Aliquote 50%, massimali e la checklist dei documenti obbligatori (CILA, Bonifici, ENEA) per non perdere le detrazioni fiscali.",
        image: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=800&auto=format&fit=crop", // Calculator/Plans
        category: "Fisco & Normative",
        date: "21 Feb 2026"
    },
    {
        id: 'umidita-risalita-roma',
        title: "Come eliminare definitivamente l'umidità di risalita nei palazzi storici romani",
        excerpt: "Una guida pratica per proprietari di immobili storici: diagnosi, costi e soluzioni definitive con la bioedilizia certificata.",
        image: "https://images.unsplash.com/photo-1464146072230-91cabc968266?q=80&w=800&auto=format&fit=crop", // Stucco / classic texture
        category: "Bioedilizia Storica",
        date: "20 Feb 2026"
    },
    {
        id: 'tendenze-bagno-2026',
        title: "Tendenze 2026 per il Bagno: Materiali Ecologici e Design Minimalista",
        excerpt: "Scopri come trasformare il tuo bagno in un'oasi di benessere utilizzando resine ecocompatibili e illuminazione integrata.",
        image: "https://images.unsplash.com/photo-1620626011761-996317b8d101?q=80&w=800&auto=format&fit=crop", // Modern bathroom
        category: "Interior Design",
        date: "15 Feb 2026"
    },
    {
        id: 'isolamento-acustico-interni',
        title: "Isolamento Acustico Naturale: Stop ai Rumori del Vicinato",
        excerpt: "Sistemi a secco e pannelli in fibra di legno o canapa per insonorizzare pareti divisorie e solette senza perdere troppo spazio.",
        image: "https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=800&auto=format&fit=crop", // Elegant interior living room
        category: "Comfort Efficienza",
        date: "10 Feb 2026"
    },
    {
        id: 'pavimenti-resina-vantaggi',
        title: "Pavimenti in Resina e Microcemento: Vantaggi e Applicazioni",
        excerpt: "Superfici continue e facili da pulire ideali per ristrutturazioni rapide: si possono posare direttamente sul pavimento esistente.",
        image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=800&auto=format&fit=crop", // Living room floor
        category: "Materiali",
        date: "05 Feb 2026"
    }
];

export default function BlogIndexPage() {
    // Schema JSON-LD Strutturato per SEO e GEO
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Blog",
        "name": "Blog Ristrutturazioni Roma | SYD Bioedilizia",
        "description": "Approfondimenti, guide e consigli sulle ristrutturazioni d'interni, bioedilizia e riqualificazione energetica.",
        "url": "https://sydbioedilizia.it/blog",
        "publisher": {
            "@type": "Organization",
            "name": "SYD Bioedilizia",
            "logo": {
                "@type": "ImageObject",
                "url": "https://sydbioedilizia.it/images/syd-logo-v2.png" // placeholder logo
            }
        },
        "blogPost": BLOG_POSTS.map(post => ({
            "@type": "BlogPosting",
            "headline": post.title,
            "description": post.excerpt,
            "image": post.image,
            "url": `https://sydbioedilizia.it/blog/${post.id}`
        }))
    };

    return (
        <>
            <Navbar />
            <main className="min-h-screen bg-background text-foreground py-20 px-4 md:px-8">
                {/* Iniezione JSON-LD sicura */}
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

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-10">
                        {BLOG_POSTS.map((post) => (
                            <Link
                                key={post.id}
                                href={`/blog/${post.id}`}
                                className="group flex flex-col bg-card rounded-2xl overflow-hidden border border-border hover:shadow-xl hover:border-primary/30 transition-all duration-300"
                            >
                                {/* Image Card */}
                                <div className="relative h-64 w-full overflow-hidden bg-muted">
                                    <Image
                                        src={post.image}
                                        alt={post.title}
                                        fill
                                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                                        sizes="(max-w-768px) 100vw, (max-w-1200px) 50vw, 33vw"
                                        priority={post.id === 'umidita-risalita-roma'}
                                    />
                                    <div className="absolute top-4 left-4">
                                        <span className="bg-background/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold text-primary">
                                            {post.category}
                                        </span>
                                    </div>
                                </div>

                                {/* Content Card */}
                                <div className="p-8 flex flex-col flex-grow">
                                    <div className="text-sm text-muted-foreground mb-3 font-medium">
                                        {post.date}
                                    </div>
                                    <h2 className="text-2xl font-bold mb-4 text-card-foreground group-hover:text-primary transition-colors line-clamp-2">
                                        {post.title}
                                    </h2>
                                    <p className="text-muted-foreground mb-8 flex-grow line-clamp-3 leading-relaxed">
                                        {post.excerpt}
                                    </p>

                                    <div className="mt-auto flex items-center text-primary font-semibold text-sm">
                                        Leggi l'articolo
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
