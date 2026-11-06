import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Navbar } from '@/components/sections/Navbar';
import { Footer } from '@/components/sections/Footer';
import ChatWidget from '@/components/chat/ChatWidget';
import { getPortfolio } from '@/lib/portfolio/server';
import { portfolioItemList, serializeJsonLd } from '@/lib/portfolio/structured-data';
import { ProjectsArchiveClient } from './ProjectsArchiveClient';

export const metadata: Metadata = {
    title: 'Progetti e Ristrutturazioni | SYD Bioedilizia',
    description:
        'L\'archivio completo delle ristrutturazioni SYD Bioedilizia a Roma e provincia: interni, cucine, bagni e riqualificazioni energetiche in bioedilizia.',
    alternates: {
        canonical: 'https://sydbioedilizia.vercel.app/progetti',
    },
    openGraph: {
        title: 'Progetti e Ristrutturazioni | SYD Bioedilizia',
        description:
            'L\'archivio completo delle ristrutturazioni SYD Bioedilizia a Roma e provincia.',
        url: 'https://sydbioedilizia.vercel.app/progetti',
        type: 'website',
    },
};

const collectionPage = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Progetti SYD Bioedilizia',
    description:
        'Archivio delle ristrutturazioni realizzate da SYD Bioedilizia a Roma e provincia.',
    url: 'https://sydbioedilizia.vercel.app/progetti',
    isPartOf: {
        '@type': 'WebSite',
        name: 'SYD BIOEDILIZIA',
        url: 'https://sydbioedilizia.vercel.app',
    },
};

export default async function ProgettiPage() {
    // Server-rendered (ISR, lib/portfolio/server.ts): crawlers get the projects and
    // their photos in the HTML, and the JSON-LD lists them (real projects only).
    const portfolio = await getPortfolio();
    const itemList = portfolioItemList(portfolio);
    const jsonLd = itemList ? { ...collectionPage, mainEntity: itemList } : collectionPage;

    return (
        <main className="min-h-screen bg-luxury-bg text-luxury-text overflow-x-clip selection:bg-luxury-teal/30">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
            />
            <Navbar />
            {/* Spacer for fixed navbar */}
            <div className="pt-20">
                <ProjectsArchiveClient initial={portfolio} />
            </div>
            <Footer />
            <Suspense fallback={<div />}>
                <ChatWidget />
            </Suspense>
        </main>
    );
}
