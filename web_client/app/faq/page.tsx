import { Metadata } from 'next';
import { Suspense } from 'react';
import { FAQ_DATA, FAQItem, CATEGORY_ICONS, faqBlocksToPlainText } from '@/lib/faq-data';
import { FAQItemCard } from '@/components/faq/FAQItem';
import { Navbar } from '@/components/sections/Navbar';
import { Footer } from '@/components/sections/Footer';
import { Coins, FileText, Sparkles, Wrench, Phone } from 'lucide-react';
import { OpenChatButton } from '@/components/ui/open-chat-button';
import ChatWidget from '@/components/chat/ChatWidget';
import { shareMetadata } from '@/lib/site-share';

const iconMap = {
  Coins,
  FileText,
  Sparkles,
  Wrench,
} as const;

export const metadata: Metadata = {
  title: 'Domande Frequenti (FAQ) | SYD Bioedilizia',
  description: 'Risposte immediate su costi ristrutturazione, tempistiche, permessi (CILA/SCIA), bonus 2026 e rendering AI. Scopri come funziona il metodo SYD.',
  // Brand logo as the preview image (the page has no photo of its own).
  ...shareMetadata(undefined, {
    title: 'Domande Frequenti (FAQ) | SYD Bioedilizia',
    description: 'Tutto quello che devi sapere prima di ristrutturare: costi, tempi, bonus 2026 e tecnologia AI.',
    path: '/faq',
  }),
  alternates: {
    canonical: '/faq',
  },
};

export default function FAQPage() {
  const categories = Array.from(new Set(FAQ_DATA.map(item => item.category)));
  const groupedFAQs: Record<string, FAQItem[]> = {};

  categories.forEach(cat => {
    groupedFAQs[cat] = FAQ_DATA.filter(item => item.category === cat);
  });

  // FAQPage + BreadcrumbList JSON-LD (SEO/GEO)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: FAQ_DATA.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faqBlocksToPlainText(faq.answer),
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
            item: 'https://sydbioedilizia.vercel.app',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Domande Frequenti',
            item: 'https://sydbioedilizia.vercel.app/faq',
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        <div className="container mx-auto px-4 max-w-4xl relative z-10 pt-32 pb-20">

          {/* Hero Header */}
          <header className="mb-16 text-center space-y-4">
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-accent-ink">
              Domande Frequenti
            </h1>
            <div className="h-1 w-[100px] bg-primary mx-auto rounded-full" />
            <p className="text-xl text-ink font-light max-w-2xl mx-auto">
              Risposte chiare e trasparenti su come trasformiamo la tua casa con l&apos;AI e l&apos;edilizia sostenibile.
            </p>
          </header>

          {/* Category Navigation */}
          <nav className="flex flex-wrap justify-center gap-3 mb-12" aria-label="Categorie FAQ">
            {categories.map((category) => {
              const iconName = CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS];
              const Icon = iconMap[iconName as keyof typeof iconMap];
              const sectionId = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
              return (
                <a
                  key={category}
                  href={`#${sectionId}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/15 bg-primary-subtle text-ink text-sm font-medium hover:border-primary/40 hover:bg-primary-subtle hover:text-primary-ink transition-all duration-200"
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  {category}
                </a>
              );
            })}
          </nav>

          {/* FAQ Sections */}
          <div className="space-y-14">
            {categories.map((category) => {
              const iconName = CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS];
              const Icon = iconMap[iconName as keyof typeof iconMap];
              const sectionId = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
              return (
                <section key={category} className="scroll-mt-32" id={sectionId}>
                  <h2 className="text-2xl font-serif font-bold text-ink mb-6 flex items-center gap-3">
                    {Icon && (
                      <span className="w-10 h-10 rounded-full bg-primary-subtle border border-primary/20 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-primary-ink" />
                      </span>
                    )}
                    {category}
                  </h2>
                  <div className="space-y-4">
                    {groupedFAQs[category].map((faq) => (
                      <FAQItemCard key={faq.slug} item={faq} />
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
            <p className="text-ink font-light mb-8 max-w-lg mx-auto">
              Il nostro team è disponibile per rispondere a ogni tua domanda. Richiedi un sopralluogo gratuito o parla con il nostro assistente AI.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="tel:+393755463599"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-accent hover:bg-accent/80 text-on-accent font-bold transition-all duration-200 shadow-lg"
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
