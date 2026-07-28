import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Navbar } from '@/components/sections/Navbar';
import { Footer } from '@/components/sections/Footer';
import ChatWidget from '@/components/chat/ChatWidget';
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

const jsonLd = {
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

export default function ProgettiPage() {
    return (
        <main className="min-h-screen bg-luxury-bg text-luxury-text overflow-x-clip selection:bg-luxury-teal/30">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <Navbar />
            {/* Spacer for fixed navbar */}
            <div className="pt-20">
                <ProjectsArchiveClient />
            </div>
            <Footer />
            <Suspense fallback={<div />}>
                <ChatWidget />
            </Suspense>
        </main>
    );
}
