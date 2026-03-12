import type { Metadata } from 'next';
import { Navbar } from '@/components/sections/Navbar';
import { Footer } from '@/components/sections/Footer';
import { CheckCircle2, FileText } from 'lucide-react';
import { BlogBackButton } from '@/components/blog/BlogBackButton';

// 1. METADATA SEO & GEO
export const metadata: Metadata = {
  title: "Quanto Costa Ristrutturare Casa nel 2026? Prezzi e ROI",
  description: "Scopri i costi medi di una ristrutturazione d'interni nel 2026: dai 600€ ai 1.200€/mq. Analisi dei prezzi e quali interventi aumentano davvero il valore dell'immobile.",
  openGraph: {
    title: "Quanto Costa Ristrutturare Casa nel 2026? Prezzi e ROI",
    description: "Scopri i costi medi di una ristrutturazione d'interni nel 2026: dai 600€ ai 1.200€/mq. Analisi dei prezzi e quali interventi aumentano davvero il valore dell'immobile.",
    type: "article",
    locale: "it_IT",
    siteName: "SYD Bioedilizia",
    publishedTime: "2026-03-10T08:00:00.000Z",
    authors: ["Team Ristrutturazioni"],
  },
  alternates: {
    canonical: "/blog/costi-ristrutturazione-casa-2026",
  },
};

export default function BlogPostCostiRistrutturazione() {
  // 2. JSON-LD STRUCTURED DATA
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "headline": "Quanto Costa Ristrutturare Casa nel 2026? Prezzi e ROI",
        "description": "Scopri i costi medi di una ristrutturazione d'interni nel 2026: dai 600€ ai 1.200€/mq. Analisi dei prezzi e quali interventi aumentano davvero il valore dell'immobile.",
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
        "datePublished": "2026-03-10",
        "dateModified": "2026-03-10",
        "mainEntityOfPage": {
          "@type": "WebPage",
          "@id": "https://sydbioedilizia.it/blog/costi-ristrutturazione-casa-2026"
        }
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://sydbioedilizia.it" },
          { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://sydbioedilizia.it/blog" },
          { "@type": "ListItem", "position": 3, "name": "Costi Ristrutturazione 2026", "item": "https://sydbioedilizia.it/blog/costi-ristrutturazione-casa-2026" }
        ]
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "Quanto costa ristrutturare un appartamento di 80 mq a Roma?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Per una ristrutturazione completa a Roma, il costo medio si attesta tra i 55.000€ e i 96.000€ incluso impianti, finiture di media qualità e IVA al 10%. Il range varia in base alle condizioni iniziali dell'immobile e al livello delle finiture."
            }
          },
          {
            "@type": "Question",
            "name": "Conviene ristrutturare per rivendere?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sì, se si interviene su cucina e bagno (ROI stimato del 60-80%), efficienza energetica e infissi. È invece sconsigliato personalizzare troppo l'immobile con finiture di nicchia che non piacciono al mercato medio."
            }
          },
          {
            "@type": "Question",
            "name": "Come si calcola il preventivo di una ristrutturazione?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Un preventivo affidabile si compone di: computo metrico delle opere (misure e quantità), prezziario regionale o DEI come base di riferimento, e voci separate per manodopera, materiali e IVA. Diffida dai preventivi globali senza dettaglio."
            }
          }
        ]
      }
    ]
  };

  return (
    <>
    <Navbar />
    <main className="min-h-screen bg-luxury-bg text-luxury-text py-12 px-4 md:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="max-w-4xl mx-auto">
        <BlogBackButton />

        <article className="prose prose-invert lg:prose-lg max-w-none">
          {/* Header */}
          <header className="mb-10 not-prose">
            <div className="inline-block bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
              Costi &amp; Preventivi
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-primary mb-4 leading-tight">
              Quanto Costa Ristrutturare Casa nel 2026? Prezzi e ROI
            </h1>
            <p className="text-xl text-muted-foreground font-medium max-w-2xl">
              Scopri i costi medi di una ristrutturazione d&apos;interni nel 2026: dai 600€ ai 1.200€/mq. Analisi dei prezzi e quali interventi aumentano davvero il valore dell&apos;immobile.
            </p>
          </header>

          {/* KEY TAKEAWAYS (GEO Optimized) */}
          <div className="bg-card border border-border rounded-xl p-6 md:p-8 my-8 shadow-sm not-prose">
            <h3 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
              📌 Punti Chiave 2026
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-foreground text-sm">600–1.200€/mq</strong>
                  <span className="text-sm text-muted-foreground">Costo medio per ristrutturazione completa in Italia nel 2026.</span>
                </div>
              </div>
              <div className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-foreground text-sm">ROI Cucina &amp; Bagno</strong>
                  <span className="text-sm text-muted-foreground">Gli interventi con il miglior ritorno sull&apos;investimento.</span>
                </div>
              </div>
              <div className="flex gap-3">
                <FileText className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-foreground text-sm">IVA al 10%</strong>
                  <span className="text-sm text-muted-foreground">Aliquota agevolata sulla manodopera per ristrutturazioni.</span>
                </div>
              </div>
              <div className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-foreground text-sm">3–4 Mesi</strong>
                  <span className="text-sm text-muted-foreground">Tempo medio per ristrutturare 100 mq.</span>
                </div>
              </div>
            </div>
          </div>

          {/* BODY CONTENT */}
          <p className="lead text-xl text-foreground/80 mb-8">
            Ristrutturare casa è uno degli investimenti più importanti che si possano fare. Nel 2026, con i costi dei materiali stabilizzati dopo anni di volatilità, è finalmente possibile pianificare con precisione. La chiave è sapere <strong>dove va ogni euro del budget</strong> e quali interventi generano davvero valore.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">Analisi dei Costi: Dove va il tuo budget?</h2>
          <p>
            Una ristrutturazione completa in Italia nel 2026 si attesta mediamente tra i <strong>600€ e i 1.200€ al metro quadro</strong>, inclusi impianti, finiture e IVA agevolata al 10%. La variazione dipende principalmente dalla qualità delle finiture scelte e dalle condizioni iniziali dell&apos;immobile. Ecco come si distribuisce tipicamente il budget:
          </p>
          <ul className="list-disc pl-6 mb-6 space-y-2">
            <li><strong>Impianti (Elettrico e Idraulico): 20-25% del budget.</strong> Nel 2026 include sistemi domotici e pompe di calore, che aumentano il costo iniziale ma generano risparmio energetico a lungo termine.</li>
            <li><strong>Opere Murarie e Pavimenti: circa il 30% dei costi.</strong> Si osserva una tendenza verso legno e materiali ecosostenibili che, pur avendo un costo unitario superiore al gres porcellanato, aumentano il valore percepito dell&apos;immobile.</li>
            <li><strong>Finiture, Infissi e Serramenti: circa il 20%.</strong> Le finestre a triplo vetro sono diventate lo standard qualitativo minimo, anche grazie alle detrazioni per efficienza energetica ancora disponibili nel 2026.</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">Quali interventi aumentano il valore della casa?</h2>
          <p>
            Non tutti gli interventi generano lo stesso ritorno sull&apos;investimento. I dati del mercato immobiliare italiano 2026 indicano una gerarchia chiara:
          </p>
          <ul className="list-disc pl-6 mb-6 space-y-2">
            <li><strong>Cucina Moderna:</strong> ROI stimato tra il 60% e l&apos;80%. Le isole in legno e le finiture calde sono le soluzioni più ricercate dai compratori nel 2026, dopo anni di dominio del bianco opaco.</li>
            <li><strong>Efficienza Energetica:</strong> Isolamento termico e pannelli radianti a pavimento abbassano la classe energetica e aumentano il valore di mercato, con impatto documentabile sulla perizia immobiliare.</li>
            <li><strong>Spazi Flessibili:</strong> La creazione di zone separate per lo smart working — anziché l&apos;open space totale — risponde alla domanda post-pandemia e posiziona l&apos;immobile su una fascia di acquirenti più ampia.</li>
          </ul>

          {/* Info box amber */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 my-8 not-prose dark:bg-amber-950/30 dark:border-amber-800">
            <p className="text-amber-900 dark:text-amber-200 text-sm font-medium">
              <strong>⚠️ Attenzione Open Space:</strong> Ridurre il numero di camere per creare cabine armadio giganti può abbassare il valore di mercato del 10-15%. Verificare sempre la tipologia di acquirenti target nella zona prima di procedere.
            </p>
          </div>

          {/* FAQ SECTION */}
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
