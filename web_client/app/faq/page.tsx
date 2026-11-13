import { Metadata } from 'next';
import { Suspense } from 'react';
import { FAQItemCard } from '@/components/faq/FAQItem';
import { Navbar } from '@/components/sections/Navbar';
import { Footer } from '@/components/sections/Footer';
import { Phone } from 'lucide-react';
import { OpenChatButton } from '@/components/ui/open-chat-button';
import ChatWidget from '@/components/chat/ChatWidget';
import { serializeJsonLd } from '@/lib/blog/seo';
import { blocksToPlainText } from '@/lib/company-info/blocks';
import { telHref } from '@/lib/company-info/format';
import { COMPANY_ICONS } from '@/lib/company-info/icons';
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
  // Categories, questions and phone come from the company info edited in the admin console.
  const { faq, faq_categories, identity } = await getCompanyInfo();
  const sections = faq_categories
    .map((category) => ({
      ...category,
      sectionId: category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      items: faq.filter((item) => item.category === category.name),
    }))
    .filter((section) => section.items.length > 0);

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
      <main className="min-h-screen bg-canvas text-ink relative overflow-hidden">
        {/* Background orbs */}
        <div className="absolute top-0 right-0 w-1/3 h-1/3 ambient-glow ambient-glow-teal [--glow-alpha:5%]" />
        <div className="absolute bottom-1/3 left-0 w-1/4 h-1/4 ambient-glow ambient-glow-gold" />

        {/* JSON-LD */}
        <script
          type="application/ld+json"
          // Questions are edited in the admin console: `<` is escaped so no text can close the script.
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />

        <div className="container mx-auto px-4 max-w-4xl relative z-10 pt-32 pb-20">

          {/* Hero Header */}
          <header className="mb-16 text-center space-y-4">
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-ink">
              Domande Frequenti
            </h1>
            <div className="h-1 w-[100px] bg-primary mx-auto rounded-full" />
            <p className="text-xl text-ink font-light max-w-2xl mx-auto">
              Risposte chiare e trasparenti su come trasformiamo la tua casa con l&apos;AI e l&apos;edilizia sostenibile.
            </p>
          </header>

          {/* Category Navigation */}
          <nav className="flex flex-wrap justify-center gap-3 mb-12" aria-label="Categorie FAQ">
            {sections.map(({ name, icon, sectionId }) => {
              const Icon = COMPANY_ICONS[icon];
              return (
                <a
                  key={name}
                  href={`#${sectionId}`}
                  className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-full border border-primary/15 bg-primary-subtle text-ink text-sm font-medium hover:border-primary/40 hover:bg-primary-subtle hover:text-primary-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas transition-all duration-200"
                >
                  <Icon className="w-4 h-4" />
                  {name}
                </a>
              );
            })}
          </nav>

          {/* FAQ Sections */}
          <div className="space-y-14">
            {sections.map(({ name, icon, sectionId, items }) => {
              const Icon = COMPANY_ICONS[icon];
              return (
                <section key={name} className="scroll-mt-32" id={sectionId}>
                  <h2 className="text-2xl font-serif font-bold text-ink mb-6 flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full bg-primary-subtle border border-primary/20 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary-ink" />
                    </span>
                    {name}
                  </h2>
                  <div className="space-y-4">
                    {items.map((faqItem) => (
                      <FAQItemCard key={faqItem.slug} item={faqItem} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          {/* CTA Section */}
          <div className="mt-20 surface-inverse p-8 md:p-10 rounded-2xl border border-line text-center">
            <h3 className="text-2xl font-serif font-bold text-accent-ink mb-3">
              Non hai trovato la risposta?
            </h3>
            <p className="text-ink leading-relaxed tracking-[0.01em] mb-8 max-w-lg mx-auto">
              Il nostro team è disponibile per rispondere a ogni tua domanda. Chiamaci o parla con il nostro assistente AI.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={telHref(identity.phone)}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-6 py-3 rounded-full border border-transparent bg-accent hover:bg-accent/80 text-on-accent font-bold transition-all duration-200 shadow-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                <Phone className="w-4 h-4" />
                Chiama Ora
              </a>
              <OpenChatButton>
                Parla con l&apos;AI
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
