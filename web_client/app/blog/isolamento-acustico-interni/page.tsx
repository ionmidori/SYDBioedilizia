import type { Metadata } from 'next';
import { Navbar } from '@/components/sections/Navbar';
import { Footer } from '@/components/sections/Footer';
import { CheckCircle2, FileText } from 'lucide-react';
import { BlogBackButton } from '@/components/blog/BlogBackButton';

// 1. METADATA SEO & GEO
export const metadata: Metadata = {
  title: "Isolamento Acustico Naturale: Stop ai Rumori del Vicinato",
  description: "Guida all'insonorizzazione naturale: pannelli in fibra di legno, canapa e sughero per pareti divisorie e soffitti. Soluzioni bioedili a Roma.",
  openGraph: {
    title: "Isolamento Acustico Naturale: Stop ai Rumori del Vicinato",
    description: "Sistemi a secco e pannelli in fibra di legno o canapa per insonorizzare pareti divisorie e solette senza perdere troppo spazio.",
    type: "article",
    locale: "it_IT",
    siteName: "SYD Bioedilizia",
    publishedTime: "2026-02-10T08:00:00.000Z",
    authors: ["SYD Bioedilizia"],
  },
  alternates: {
    canonical: "/blog/isolamento-acustico-interni",
  },
};

export default function BlogPostIsolamento() {
  // 2. JSON-LD STRUCTURED DATA
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "headline": "Isolamento Acustico Naturale: Stop ai Rumori del Vicinato",
        "description": "Guida tecnica all'uso di materiali naturali per l'isolamento acustico di interni.",
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
        "datePublished": "2026-02-10",
        "dateModified": "2026-02-10",
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": "https://sydbioedilizia.it/blog/isolamento-acustico-interni"
        }
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://sydbioedilizia.it" },
          { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://sydbioedilizia.it/blog" },
          { "@type": "ListItem", "position": 3, "name": "Isolamento Acustico", "item": "https://sydbioedilizia.it/blog/isolamento-acustico-interni" }
        ]
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "Quanto spazio si perde per isolare una parete?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Con i moderni sistemi a secco e materiali ad alta densità, bastano dai 5 agli 8 cm per ottenere un abbattimento acustico significativo (fino a 60dB)."
            }
          },
          {
            "@type": "Question",
            "name": "La fibra di canapa è efficace contro i rumori?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sì, la fibra di canapa ha ottime proprietà fonoassorbenti grazie alla sua struttura porosa, ed è completamente traspirante ed ecologica."
            }
          },
          {
            "@type": "Question",
            "name": "Si può isolare il soffitto dai rumori del piano di sopra?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sì, tramite la realizzazione di un controsoffitto acustico sospeso con antivibranti, che disaccoppia la struttura ed evita la trasmissione delle vibrazioni."
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
              Comfort & Efficienza
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-primary mb-4 leading-tight">
              Isolamento Acustico Naturale: Stop ai Rumori del Vicinato
            </h1>
            <p className="text-xl text-muted-foreground font-medium max-w-2xl">
              Come ritrovare il silenzio in casa utilizzando materiali sani e tecnologie a secco, senza sacrificare metri quadri preziosi.
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
                  <strong className="block text-foreground text-sm">Materiali Naturali</strong>
                  <span className="text-sm text-muted-foreground">Sughero, Canapa, Fibra di Legno: sani e performanti.</span>
                </div>
              </div>
              <div className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-foreground text-sm">Sistema "Massa-Molla-Massa"</strong>
                  <span className="text-sm text-muted-foreground">La tecnica più efficace per rompere l'onda sonora.</span>
                </div>
              </div>
              <div className="flex gap-3">
                <FileText className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-foreground text-sm">Poco Spessore</strong>
                  <span className="text-sm text-muted-foreground">Soluzioni performanti in soli 5-8 cm di ingombro.</span>
                </div>
              </div>
              <div className="flex gap-3">
                 <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-foreground text-sm">Salute Indoor</strong>
                  <span className="text-sm text-muted-foreground">Nessuna emissione di VOC o formaldeide.</span>
                </div>
              </div>
            </div>
          </div>
          
          <p className="lead text-xl text-foreground/80 mb-8">
            Il comfort abitativo non è solo termico, ma anche acustico. Vivere in un ambiente rumoroso aumenta lo stress e riduce la qualità del sonno. 
            Fortunatamente, la bioedilizia offre soluzioni eccellenti per isolare la casa dai rumori esterni e dai vicini, utilizzando materiali che rispettano la salute.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">Il principio Massa-Molla-Massa</h2>
          <p>
            Per bloccare il suono non serve solo "peso" (massa), ma anche un elemento smorzante (molla). 
            Le contropareti acustiche a secco funzionano proprio così:
          </p>
          <ul className="list-disc pl-6 mb-6 space-y-2">
            <li><strong>Massa 1:</strong> La parete esistente in muratura.</li>
            <li><strong>Molla:</strong> Il pannello isolante fibroso (Canapa o Fibra di Legno) inserito nell'intercapedine, che assorbe l'energia sonora.</li>
            <li><strong>Massa 2:</strong> Il rivestimento finale in lastre (Cartongesso ad alta densità o Gessofibra), che riflette l'onda residua.</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">Perché scegliere materiali naturali?</h2>
          <p>
            A differenza delle lane minerali sintetiche, i materiali naturali come la <strong>fibra di canapa</strong> o i pannelli in <strong>legno mineralizzato</strong> offrono vantaggi aggiuntivi:
          </p>
          <ul className="list-disc pl-6 mb-6 space-y-2">
            <li><strong>Traspirabilità:</strong> Regolano l'umidità interna, prevenendo muffe dietro la controparete.</li>
            <li><strong>Inerzia Termica:</strong> Migliorano anche l'isolamento dal caldo e dal freddo.</li>
            <li><strong>Durata:</strong> Non si sfaldano nel tempo e mantengono le prestazioni inalterate.</li>
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
