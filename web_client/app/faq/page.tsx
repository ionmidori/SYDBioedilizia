import { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ChevronRight, MessageSquare } from 'lucide-react';
import { CompanyContextStrip } from '@/components/faq/CompanyContextStrip';
import { FAQExplorer } from '@/components/faq/FAQExplorer';
import { Navbar } from '@/components/sections/Navbar';
import { Footer } from '@/components/sections/Footer';
import { OpenChatButton } from '@/components/ui/open-chat-button';
import ChatWidget from '@/components/chat/ChatWidget';
import { serializeJsonLd } from '@/lib/blog/seo';
import { blocksToPlainText } from '@/lib/company-info/blocks';
import { buildFaqSections } from '@/lib/company-info/faq-sections';
import { getCompanyInfo } from '@/lib/company-info/server';
import { SITE_URL } from '@/lib/site';
import { shareMetadata } from '@/lib/site-share';

export const metadata: Metadata = {
  title: 'Domande Frequenti (FAQ)',
  description: 'Risposte immediate su costi ristrutturazione, tempistiche, permessi (CILA/SCIA) e rendering AI. Scopri come funziona il metodo SYD.',
  // Brand logo as the preview image (the page has no photo of its own).
  ...shareMetadata(undefined, {
    title: 'Domande Frequenti (FAQ) | SYD Bioedilizia',
    description: 'Tutto quello che devi sapere prima di ristrutturare: costi, tempi, permessi e tecnologia AI.',
    path: '/faq',
  }),
  alternates: {
    canonical: '/faq',
  },
};

export default async function FAQPage() {
  // Categories and questions come from the company info edited in the admin console.
  const companyInfo = await getCompanyInfo();
  const { faq, faq_categories } = companyInfo;
  const sections = buildFaqSections(faq_categories, faq);

  // FAQPage + BreadcrumbList JSON-LD (SEO/GEO)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: faq.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: blocksToPlainText(item.answer),
          },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: SITE_URL,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Domande Frequenti',
            item: `${SITE_URL}/faq`,
          },
        ],
      },
    ],
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-canvas text-ink relative overflow-clip">
        {/* Background orbs */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-0 w-1/3 h-1/3 ambient-glow ambient-glow-teal [--glow-alpha:5%]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1/3 left-0 w-1/4 h-1/4 ambient-glow ambient-glow-gold"
        />

        {/* JSON-LD */}
        <script
          type="application/ld+json"
          // Questions are edited in the admin console: `<` is escaped so no text can close the script.
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />

        <div className="container mx-auto px-4 max-w-4xl relative z-10 pt-28 pb-20">
          {/* Semantic Breadcrumb */}
          <nav
            aria-label="Breadcrumb"
            className="mb-8 flex items-center justify-center gap-2 text-sm text-ink-muted"
          >
            <Link
              href="/"
              className="inline-flex items-center min-h-[44px] px-2 hover:text-primary-ink transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              Home
            </Link>
            <ChevronRight className="w-4 h-4 text-ink-subtle shrink-0" aria-hidden="true" />
            <span aria-current="page" className="text-ink font-medium">
              Domande Frequenti
            </span>
          </nav>

          {/* Hero Header */}
          <header className="mb-12 text-center space-y-4">
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-ink">
              Domande Frequenti
            </h1>
            <div className="h-1 w-[100px] bg-primary mx-auto rounded-full" />
            <p className="text-xl text-ink font-light max-w-2xl mx-auto">
              Risposte chiare e trasparenti su come trasformiamo la tua casa con l&apos;AI e l&apos;edilizia sostenibile.
            </p>
          </header>

          {/* Search, Category Filter & Accordion List */}
          <FAQExplorer sections={sections} />

          {/* Method, Transparency & Service Area */}
          <CompanyContextStrip info={companyInfo} />

          {/* CTA Section */}
          <div className="mt-16 surface-inverse p-8 md:p-10 rounded-2xl border border-line text-center">
            <h2 className="text-2xl font-serif font-bold text-accent-ink mb-3">
              Non hai trovato la risposta?
            </h2>
            <p className="text-ink leading-relaxed tracking-[0.01em] mb-8 max-w-lg mx-auto">
              Il nostro assistente SYD è disponibile per rispondere a ogni domanda sul tuo progetto di ristrutturazione.
            </p>
            <div className="flex justify-center">
              <OpenChatButton
                prompt="Ciao SYD, ho letto le FAQ e vorrei chiedere una consulenza sul mio progetto"
                className="bg-primary hover:bg-primary-hover text-on-primary font-bold border-transparent shadow-lg"
              >
                <MessageSquare className="w-4 h-4" aria-hidden="true" />
                Chiedi a SYD
              </OpenChatButton>
            </div>
          </div>
        </div>
        <Suspense fallback={<div />}>
          <ChatWidget />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
