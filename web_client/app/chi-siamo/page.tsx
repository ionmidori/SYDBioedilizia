import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Navbar } from '@/components/sections/Navbar';
import { About } from '@/components/sections/About';
import { Footer } from '@/components/sections/Footer';
import ChatWidget from '@/components/chat/ChatWidget';
import { serializeJsonLd } from '@/lib/blog/seo';
import { getCompanyInfo } from '@/lib/company-info/server';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { shareMetadata } from '@/lib/site-share';

const CHI_SIAMO_DESCRIPTION =
    'Scopri SYD Bioedilizia a Roma e provincia: team tecnico con oltre 30 anni d\'esperienza, materiali CAM e ristrutturazioni chiavi in mano.';

export const metadata: Metadata = {
    title: 'Chi Siamo',
    description: CHI_SIAMO_DESCRIPTION,
    ...shareMetadata(undefined, {
        title: `Chi Siamo | ${SITE_NAME}`,
        description: CHI_SIAMO_DESCRIPTION,
        path: '/chi-siamo',
    }),
    alternates: {
        canonical: '/chi-siamo',
    },
};

export default async function ChiSiamoPage() {
    // Texts and works come from the company info edited in the admin console.
    const { about, services } = await getCompanyInfo();
    const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'AboutPage',
                name: `Chi Siamo | ${SITE_NAME}`,
                description: CHI_SIAMO_DESCRIPTION,
                url: `${SITE_URL}/chi-siamo`,
                mainEntity: { '@id': `${SITE_URL}/#business` },
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
                    { '@type': 'ListItem', position: 2, name: 'Chi Siamo', item: `${SITE_URL}/chi-siamo` },
                ],
            },
        ],
    };

    return (
        <main className="min-h-screen bg-canvas text-ink overflow-x-hidden selection:bg-primary/30">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
            />
            <Navbar />
            {/* Spacer for fixed navbar */}
            <div className="pt-20">
                <About about={about} services={services.items} />
            </div>
            <Footer />
            <Suspense fallback={<div />}>
                <ChatWidget />
            </Suspense>
        </main>
    );
}
