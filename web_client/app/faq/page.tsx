import { Metadata } from 'next';
import { FAQ_DATA, FAQItem } from '@/lib/faq-data';
import { FAQItemCard } from '@/components/faq/FAQItem';
import { Navbar } from '@/components/sections/Navbar';
import { Footer } from '@/components/sections/Footer';

export const metadata: Metadata = {
  title: 'Domande Frequenti (FAQ) | SYD Bioedilizia',
  description: 'Risposte immediate su costi ristrutturazione, tempistiche, permessi (CILA/SCIA) e rendering AI. Scopri come funziona il metodo SYD.',
  openGraph: {
    title: 'Domande Frequenti (FAQ) | SYD Bioedilizia',
    description: 'Tutto quello che devi sapere prima di ristrutturare: costi, tempi e bonus 2026.',
    type: 'website',
  },
};

export default function FAQPage() {
  // 1. Group FAQs by Category
  const categories = Array.from(new Set(FAQ_DATA.map(item => item.category)));
  const groupedFAQs: Record<string, FAQItem[]> = {};
  
  categories.forEach(cat => {
    groupedFAQs[cat] = FAQ_DATA.filter(item => item.category === cat);
  });

  // 2. Generate JSON-LD for Google/AI
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_DATA.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer.replace(/<[^>]*>?/gm, ''), // Strip HTML for clean JSON-LD text preview if needed, or keep as HTML if supported (Google supports HTML in FAQ schema)
      },
    })),
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background text-foreground py-12 md:py-20 pt-32">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Header Section */}
          <header className="mb-12 text-center space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Domande Frequenti
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Risposte chiare e trasparenti su come trasformiamo la tua casa con l'AI e l'edilizia sostenibile.
            </p>
          </header>

          {/* JSON-LD Script */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />

          {/* FAQ List Grouped by Category */}
          <div className="space-y-12">
            {categories.map((category) => (
              <section key={category} className="scroll-mt-32" id={category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}>
                <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
                  <span className="w-1 h-8 bg-primary rounded-full block" />
                  {category}
                </h2>
                <div className="space-y-4">
                  {groupedFAQs[category].map((faq) => (
                    <FAQItemCard key={faq.slug} item={faq} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Contact CTA */}
          <div className="mt-20 p-8 border border-border/40 bg-card/30 backdrop-blur rounded-2xl text-center">
            <h3 className="text-xl font-medium mb-2">Non hai trovato la risposta?</h3>
            <p className="text-muted-foreground mb-6">
              Il nostro assistente AI è disponibile 24/7 per rispondere a dubbi specifici sul tuo progetto.
            </p>
            <a 
              href="/dashboard" 
              className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-primary text-primary-foreground font-medium transition-transform hover:scale-105 active:scale-95"
            >
              Parla con l'AI
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
