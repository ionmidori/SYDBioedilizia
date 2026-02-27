import type { Metadata } from 'next';
import { Navbar } from '@/components/sections/Navbar';
import { Footer } from '@/components/sections/Footer';
import { CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import { BlogBackButton } from '@/components/blog/BlogBackButton';

// 1. METADATA SEO & GEO
export const metadata: Metadata = {
  title: "Bonus Ristrutturazioni 2026: Guida Detrazioni 50% e Novità",
  description: "Tutto quello che devi sapere sui Bonus Casa 2025-2026. Detrazione 50%, tetto di spesa, bonifici parlanti e documenti obbligatori (CILA, ENEA).",
  openGraph: {
    title: "Bonus Ristrutturazioni 2026: La Guida Completa",
    description: "Scarica la checklist dei documenti e scopri come ottenere il 50% di detrazione per la tua ristrutturazione a Roma.",
    type: "article",
    locale: "it_IT",
    siteName: "SYD Bioedilizia",
  },
  alternates: {
    canonical: "/blog/bonus-ristrutturazioni-2025-2026",
  },
};

export default function BlogPostBonus() {
  // 2. JSON-LD STRUCTURED DATA
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "headline": "Bonus Ristrutturazioni 2026: Guida Completa e Novità Fiscali",
        "description": "Analisi tecnica delle detrazioni fiscali per ristrutturazioni edilizie nel 2026: aliquote, massimali e adempimenti burocratici.",
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
        "datePublished": "2026-02-21",
        "dateModified": "2026-02-21",
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": "https://sydbioedilizia.it/blog/bonus-ristrutturazioni-2025-2026"
        }
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://sydbioedilizia.it" },
          { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://sydbioedilizia.it/blog" },
          { "@type": "ListItem", "position": 3, "name": "Bonus Ristrutturazioni 2026", "item": "https://sydbioedilizia.it/blog/bonus-ristrutturazioni-2025-2026" }
        ]
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "Qual è il tetto massimo di spesa per il Bonus Ristrutturazioni 2026?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Per il 2026, il tetto di spesa detraibile è confermato a 96.000€ per unità immobiliare per le prime case, con una detrazione del 50%."
            }
          },
          {
            "@type": "Question",
            "name": "Serve la comunicazione ENEA per la ristrutturazione?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sì, la comunicazione ENEA è obbligatoria entro 90 giorni dalla fine dei lavori se l'intervento comporta un risparmio energetico (es. nuovi infissi, caldaie, isolamento)."
            }
          },
          {
            "@type": "Question",
            "name": "Posso cedere il credito o avere lo sconto in fattura nel 2026?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "No, salvo casi molto specifici (edilizia libera avviata prima del 17 febbraio 2023 o zone terremotate). La regola generale è la detrazione diretta in 10 anni nella dichiarazione dei redditi."
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
          {/* Header */}
          <header className="mb-10 not-prose">
            <div className="inline-block bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
              Fisco & Normative
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-primary mb-4 leading-tight">
              Bonus Ristrutturazioni 2026: La Guida Completa senza sorprese
            </h1>
            <p className="text-xl text-muted-foreground font-medium max-w-2xl">
              Aliquote, massimali e la checklist dei documenti obbligatori per non perdere le detrazioni fiscali quest&apos;anno.
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
                  <strong className="block text-foreground text-sm">Aliquota 50%</strong>
                  <span className="text-sm text-muted-foreground">Confermata per manutenzione straordinaria su prime case.</span>
                </div>
              </div>
              <div className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-foreground text-sm">Tetto 96.000€</strong>
                  <span className="text-sm text-muted-foreground">Limite massimo di spesa detraibile per unità immobiliare.</span>
                </div>
              </div>
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-foreground text-sm">Niente Cessione</strong>
                  <span className="text-sm text-muted-foreground">Stop a sconto in fattura e cessione del credito (salvo deroghe sisma).</span>
                </div>
              </div>
              <div className="flex gap-3">
                <FileText className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-foreground text-sm">Obbligo CILA</strong>
                  <span className="text-sm text-muted-foreground">Fondamentale presentare la pratica edilizia PRIMA dell&apos;inizio lavori.</span>
                </div>
              </div>
            </div>
          </div>

          {/* BODY CONTENT */}
          <p className="lead text-xl text-foreground/80 mb-8">
            Pianificare una ristrutturazione a Roma nel 2026 richiede non solo competenza tecnica, ma anche un&apos;attenta pianificazione fiscale.
            Con la fine dell&apos;era del Superbonus e dello sconto in fattura, il <strong>Bonus Ristrutturazioni &quot;classico&quot;</strong> torna ad essere il protagonista indiscusso.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">Cosa puoi detrarre esattamente?</h2>
          <p>
            Il bonus copre il 50% delle spese sostenute per lavori di <strong>manutenzione straordinaria</strong>, restauro e risanamento conservativo sulle singole unità immobiliari residenziali.
            Rientrano in questa categoria:
          </p>
          <ul className="list-disc pl-6 mb-6 space-y-2">
            <li>Spostamento di tramezzi e pareti interne.</li>
            <li>Rifacimento completo di bagni (compresi impianti idraulici).</li>
            <li>Sostituzione di infissi e serramenti con modifica di materiale/tipologia.</li>
            <li>Installazione di impianti di climatizzazione (se a pompa di calore).</li>
            <li>Interventi di deumidificazione strutturale (Barriera Chimica + Intonaco NHL).</li>
          </ul>

          <div className="bg-amber-500/10 border-l-4 border-amber-500 p-4 my-6 text-sm text-amber-700 dark:text-amber-400">
            <strong>Attenzione alla Manutenzione Ordinaria:</strong> La semplice tinteggiatura o la sostituzione dei pavimenti SENZA rifacimento impianti o demolizioni NON è detraibile, a meno che non faccia parte di un intervento più ampio di manutenzione straordinaria (c.d. &quot;lavori trainati&quot;).
          </div>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">La Burocrazia: I 3 Pilastri per non perdere i soldi</h2>
          <p>
            L&apos;Agenzia delle Entrate intensificherà i controlli nel 2026. Per dormire sonni tranquilli, assicurati di avere questi tre elementi in ordine:
          </p>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-primary">1. La CILA (o SCIA)</h3>
          <p>
            Non si può detrarre nulla senza un titolo abilitativo. La <strong>CILA (Comunicazione Inizio Lavori Asseverata)</strong> deve essere protocollata al Comune di Roma (tramite SUET) <strong>prima</strong> dell&apos;inizio dei lavori e prima del pagamento delle prime fatture.
            La data della CILA fa fede per l&apos;inizio della detrazione.
          </p>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-primary">2. Il Bonifico &quot;Parlante&quot;</h3>
          <p>
            Non basta un bonifico ordinario. Devi usare il bonifico specifico per ristrutturazioni (art. 16-bis DPR 917/86), che riporti:
          </p>
          <ul className="list-disc pl-6 mb-2">
            <li>Codice Fiscale del beneficiario della detrazione (TU).</li>
            <li>Partita IVA dell&apos;impresa esecutrice.</li>
            <li>Riferimento alla fattura pagata.</li>
          </ul>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-primary">3. La Pratica ENEA</h3>
          <p>
            Spesso dimenticata, ma obbligatoria. Se installi nuovi infissi, caldaie, pompe di calore o isolamenti, devi trasmettere i dati all&apos;ENEA entro 90 giorni dalla fine lavori. La mancata comunicazione può comportare la perdita dell&apos;Ecobonus (65%) e sanzioni per il Bonus Casa (50%).
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">Il vantaggio nascosto: IVA agevolata al 10%</h2>
          <p>
            Oltre alla detrazione IRPEF, sulle ristrutturazioni si applica l&apos;IVA ridotta al 10% (invece del 22%) sulla manodopera e, con certi limiti, sui beni significativi (rubinetterie, sanitari, infissi).
            <br/>
            Esempio: Su un preventivo di 10.000€ + IVA, pagherai 11.000€ invece di 12.200€, risparmiando subito 1.200€ di liquidità, oltre a recuperarne 5.500€ in 10 anni.
          </p>

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

