import type { Metadata } from 'next';
import { Navbar } from '@/components/sections/Navbar';
import { Footer } from '@/components/sections/Footer';
import { CheckCircle2, FileText } from 'lucide-react';
import { BlogBackButton } from '@/components/blog/BlogBackButton';

// 1. METADATA SEO & GEO
export const metadata: Metadata = {
  title: "Pavimenti in Resina e Microcemento: Vantaggi e Applicazioni",
  description: "Guida completa ai pavimenti in resina e microcemento: spessori ridotti, resistenza e design continuo. Ideale per ristrutturazioni senza demolizioni.",
  openGraph: {
    title: "Pavimenti in Resina e Microcemento: Vantaggi e Applicazioni",
    description: "Superfici continue e facili da pulire ideali per ristrutturazioni rapide: si possono posare direttamente sul pavimento esistente.",
    type: "article",
    locale: "it_IT",
    siteName: "SYD Bioedilizia",
    publishedTime: "2026-02-05T08:00:00.000Z",
    authors: ["SYD Bioedilizia"],
  },
  alternates: {
    canonical: "/blog/pavimenti-resina-vantaggi",
  },
};

export default function BlogPostResina() {
  // 2. JSON-LD STRUCTURED DATA
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "headline": "Pavimenti in Resina e Microcemento: Vantaggi e Applicazioni",
        "description": "Guida tecnica e vantaggi dei pavimenti continui in resina e microcemento per interni residenziali.",
        "author": {
          "@type": "Organization",
          "name": "SYD Bioedilizia",
          "url": "https://sydbioedilizia.it"
        },
        "publisher": {
            "@type": "Organization",
            "name": "SYD Bioedilizia",
            "logo": {
                "@type": "ImageObject",
                "url": "https://sydbioedilizia.it/images/logo.png"
            }
        },
        "datePublished": "2026-02-05",
        "dateModified": "2026-02-05",
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": "https://sydbioedilizia.it/blog/pavimenti-resina-vantaggi"
        }
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://sydbioedilizia.it" },
          { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://sydbioedilizia.it/blog" },
          { "@type": "ListItem", "position": 3, "name": "Pavimenti Resina", "item": "https://sydbioedilizia.it/blog/pavimenti-resina-vantaggi" }
        ]
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "È possibile posare la resina sopra le vecchie piastrelle?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sì, è uno dei grandi vantaggi. Grazie al basso spessore (2-4mm), si può applicare direttamente sull&apos;esistente, risparmiando costi di demolizione."
            }
          },
          {
            "@type": "Question",
            "name": "La resina è adatta al riscaldamento a pavimento?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Assolutamente sì. Avendo uno spessore ridotto, garantisce un&apos;ottima conducibilità termica e una rapida messa a regime dell&apos;impianto."
            }
          },
          {
            "@type": "Question",
            "name": "I pavimenti in microcemento si macchiano facilmente?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "No, se trattati correttamente con finiture protettive poliuretaniche di alta qualità. Sono resistenti, impermeabili e molto facili da pulire."
            }
          }
        ]
      }
    ]
  };

  return (
    <>
    <Navbar />
    <main className="min-h-screen bg-background text-foreground py-12 px-4 md:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="max-w-4xl mx-auto">
        <BlogBackButton />

        <article className="prose prose-stone lg:prose-lg dark:prose-invert max-w-none">
          <header className="mb-10 not-prose">
            <div className="inline-block bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
              Materiali e Finiture
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-primary mb-4 leading-tight">
              Pavimenti in Resina e Microcemento: Vantaggi e Applicazioni
            </h1>
            <p className="text-xl text-muted-foreground font-medium max-w-2xl">
              Superfici continue, resistenti e di design. Scopri perché sono la scelta ideale per le ristrutturazioni moderne. 
            </p>
          </header>

          <div className="bg-card border border-border rounded-xl p-6 md:p-8 my-8 shadow-sm not-prose">
            <h3 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
              📌 Punti Chiave
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-foreground text-sm">No Demolizioni</strong>
                  <span className="text-sm text-muted-foreground">Si applica sopra il pavimento esistente (spessore 3mm).</span>
                </div>
              </div>
              <div className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-foreground text-sm">Igiene Totale</strong>
                  <span className="text-sm text-muted-foreground">Assenza di fughe dove si annidano sporco e batteri.</span>
                </div>
              </div>
              <div className="flex gap-3">
                <FileText className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-foreground text-sm">Impermeabile</strong>
                  <span className="text-sm text-muted-foreground">Perfetto anche per bagni e cucine.</span>
                </div>
              </div>
              <div className="flex gap-3">
                 <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-foreground text-sm">Personalizzabile</strong>
                  <span className="text-sm text-muted-foreground">Ampia gamma di colori, texture ed effetti spatolati.</span>
                </div>
              </div>
            </div>
          </div>

          <p className="lead text-xl text-foreground/80 mb-8">
            Se stai pensando di ristrutturare casa ma temi polvere, macerie e tempi lunghi, il <strong>microcemento</strong> (o resina cementizia) potrebbe essere la soluzione che cerchi.
            Questo materiale permette di trasformare radicalmente l&apos;estetica di un ambiente in pochi giorni, senza rimuovere il vecchio pavimento.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">Cos&apos;è il Microcemento?</h2>
          <p>
            È un rivestimento a base cementizia, polimeri a base d&apos;acqua, additivi e pigmenti minerali.
            A differenza della resina epossidica (più plastica), il microcemento ha un aspetto più naturale e materico, simile al calcestruzzo ma più caldo al tatto.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">Vantaggi in Ristrutturazione</h2>
          <ul className="list-disc pl-6 mb-6 space-y-2">
            <li><strong>Velocità:</strong> Un cantiere medio si chiude in 5-7 giorni lavorativi.</li>
            <li><strong>Continuità:</strong> Puoi rivestire pavimenti, pareti e persino mobili, creando un effetto &quot;scatola&quot; molto contemporaneo.</li>
            <li><strong>Resistenza:</strong> Una volta protetto, resiste a urti, graffi e agenti chimici domestici.</li>
          </ul>

          <section className="mt-16 not-prose border-t border-border pt-12">
            <h2 className="text-2xl font-bold mb-8 text-foreground">
              FAQ: Domande Frequenti
            </h2>
            <div className="space-y-4">
              {(jsonLd["@graph"][2]! as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> }).mainEntity.map((faq, index) => (
                <div key={index} className="bg-card p-5 rounded-lg border border-border">
                  <h4 className="font-bold text-primary mb-2">{faq.name}</h4>
                  <p className="text-sm text-muted-foreground">{faq.acceptedAnswer.text}</p>
                </div>
              ))}
            </div>
          </section>

        </article>
      </div>
    </main>
    <Footer />
    </>
  );
}



