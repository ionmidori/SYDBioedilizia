import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Navbar } from '@/components/sections/Navbar';
import { Footer } from '@/components/sections/Footer';

// 1. Definizione dei Metadati (SEO Server-Side)
export const metadata: Metadata = {
  title: "Eliminare Umidità di Risalita Roma | Bioedilizia Storica",
  description: "Guida definitiva 2026: costi, detrazioni e soluzioni in bioedilizia per muri in tufo e palazzi storici a Roma.",
  openGraph: {
    title: "Stop Umidità di Risalita a Roma: Soluzioni Bio",
    description: "Scopri come risanare i muri storici romani con materiali naturali e detrazioni 2026.",
    type: "article",
    locale: "it_IT",
    siteName: "SYD Bioedilizia",
  },
  alternates: {
    canonical: "/blog/umidita-risalita-roma",
  },
};

export default function BlogPostUmidita() {
  // 2. Schema JSON-LD Strutturato (FAQ + Breadcrumb)
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": "https://sydbioedilizia.it"
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "Blog",
            "item": "https://sydbioedilizia.it/blog"
          },
          {
            "@type": "ListItem",
            "position": 3,
            "name": "Umidità di Risalita Roma",
            "item": "https://sydbioedilizia.it/blog/umidita-risalita-roma"
          }
        ]
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "Quanto costa eliminare l'umidità di risalita a Roma?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Il costo varia in base allo spessore del muro storico e ai metri lineari. L'investimento è ammortizzabile con detrazioni fiscali del 50% (abitazione principale) o 36% valide per il 2026."
            }
          },
          {
            "@type": "Question",
            "name": "La barriera chimica per l'umidità è tossica?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "No, se si usano resine silaniche VOC-free per la bioedilizia. Creano uno sbarramento idrorepellente ecocompatibile, sicuro per la salute."
            }
          },
          {
            "@type": "Question",
            "name": "Quanto tempo serve per far asciugare un muro in tufo?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "L'evaporazione naturale con intonaci macroporosi (NHL) può richiedere mesi, ma il benessere igrometrico e lo stop ai sali sono immediati."
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
      {/* 3. Iniezione JSON-LD sicura */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="max-w-4xl mx-auto">
        {/* Navigation / Back Link */}
        <div className="mb-8">
          <Link 
            href="/blog" 
            className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Torna al Blog
          </Link>
        </div>

        <article className="prose prose-stone lg:prose-lg dark:prose-invert max-w-none">
          {/* Header */}
          <header className="mb-10 not-prose">
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-primary mb-4 leading-tight">
              Come eliminare definitivamente l'umidità di risalita nei palazzi storici romani
            </h1>
            <p className="text-xl text-muted-foreground font-medium max-w-2xl">
              Una guida pratica per proprietari di immobili storici: diagnosi, costi e soluzioni definitive con la bioedilizia certificata.
            </p>
          </header>
          
          {/* Body Content */}
          <p className="lead text-xl text-foreground/80 mb-8">
            Chi possiede un immobile al piano terra o seminterrato a Roma conosce bene il nemico silenzioso che sgretola gli intonaci: l'<strong>umidità di risalita capillare</strong>. 
            Non è solo un problema estetico, ma una patologia edilizia legata a doppio filo con la geologia stessa della Città Eterna.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">Perché i muri di Roma "bevono"?</h2>
          <p>
            Il sottosuolo di Roma è ricco di falde acquifere superficiali e composto prevalentemente da materiali vulcanici porosi come il <strong>tufo</strong> e la <strong>pozzolana</strong>. 
            Questi materiali agiscono come una spugna: attraverso un sistema di minuscoli capillari, l'acqua presente nel terreno risale lungo le murature, vincendo la forza di gravità.
          </p>
          <p>
            L'acqua che risale non è pura: trasporta con sé <strong>sali minerali</strong> (solfati, nitrati, cloruri) sciolti nel terreno. Quando l'acqua evapora dalla superficie del muro, questi sali cristallizzano, aumentando di volume fino a 12 volte. È questa pressione (detta pressione di cristallizzazione) che fa "esplodere" l'intonaco e polverizza le pitture.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">L'errore fatale: Cemento e Contropareti</h2>
          <p>
            Negli anni '70 e '80, la risposta standard a questo problema è stata l'uso massiccio di <strong>intonaci cementizi impermeabili</strong> o la costruzione di contropareti in cartongesso. 
            Questo approccio è fallimentare per due motivi:
          </p>
          <ul className="list-disc pl-6 mb-6 space-y-2">
            <li>
              <strong>Effetto Tappo:</strong> Il cemento impedisce al muro di "respirare". L'umidità, non potendo uscire, sale ancora più in alto (spesso arrivando al primo piano) o si accumula dietro l'intonaco finché questo non si distacca in blocchi.
            </li>
            <li>
              <strong>Occultamento (Contropareti):</strong> Nascondere il muro umido dietro al cartongesso crea un microclima insalubre nell'intercapedine, favorendo la proliferazione di <strong>muffe nere (Stachybotrys)</strong> tossiche per l'apparato respiratorio.
            </li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">La Soluzione Definitiva: Il Protocollo Bioedile</h2>
          <p>
            Per risanare un palazzo storico vincolato o un appartamento in centro, l'unico approccio durevole è assecondare la fisica dell'edificio, non combatterla. Ecco i 3 step del nostro protocollo certificato:
          </p>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-primary">1. Barriera Chimica a Lenta Diffusione</h3>
          <p>
            Dimenticate le vecchie iniezioni ad alta pressione che rischiavano di danneggiare i mattoni fragili. 
            La moderna tecnologia utilizza <strong>creme silaniche monomeriche</strong> a lenta diffusione. Vengono praticati piccoli fori (12mm) alla base del muro, all'interno dei quali viene inserita una crema ecologica. 
            Questa viene assorbita dal muro e polimerizza, creando uno sbarramento idrofobo orizzontale che impedisce all'acqua di salire, pur mantenendo la permeabilità al vapore.
          </p>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-primary">2. Intonaco Macroporoso NHL (Il Polmone)</h3>
          <p>
            Una volta bloccata la risalita, il muro contiene ancora litri d'acqua residua. Qui entra in gioco l'intonaco deumidificante a base di <strong>Calce Idraulica Naturale (NHL 3.5 o 5)</strong>.
            A differenza del cemento, questo intonaco ha una struttura alveolare (macropori) che aspira l'umidità dal muro e la cede all'ambiente sotto forma di vapore invisibile, molto più velocemente di quanto il muro possa assorbirla. Inoltre, i pori accolgono i sali cristallizzati senza spaccarsi.
          </p>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-primary">3. Pitture ai Silicati o alla Calce</h3>
          <p>
            L'ultimo strato deve garantire la massima traspirabilità. Utilizziamo esclusivamente pitture ai <strong>silicati di potassio</strong> o grassello di calce, che si legano chimicamente al supporto (processo di silicatizzazione) e garantiscono un aspetto estetico vibrante e naturale, perfetto per i centri storici.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">Costi e Detrazioni Fiscali 2026</h2>
          <p>
            Risanare definitivamente costa mediamente il 30-40% in più rispetto a un "rattoppo" tradizionale, ma è un investimento definitivo.
            La buona notizia è che l'Agenzia delle Entrate conferma per tutto il 2026 le agevolazioni per il recupero del patrimonio edilizio:
          </p>
          <div className="bg-muted/50 p-6 rounded-lg border-l-4 border-primary my-6">
            <h4 className="font-bold text-lg mb-2">Bonus Ristrutturazioni 2026</h4>
            <p className="mb-0">
              È possibile detrarre dall'IRPEF il <strong>50% delle spese sostenute</strong> (fino a un tetto di 96.000€ per unità immobiliare) in 10 quote annuali. 
              L'intervento di deumidificazione rientra a pieno titolo nella "Manutenzione Straordinaria" necessaria per il risanamento igienico-sanitario.
            </p>
          </div>
          <p>
            Non lasciare che l'umidità comprometta il valore del tuo immobile e la salute della tua famiglia. Un intervento ben progettato oggi salva il tuo patrimonio per i prossimi 50 anni.
          </p>

          {/* 4. Sezione FAQ con Styling Tailwind (Tier 2 UI) */}
          <section className="mt-16 not-prose border-t border-border pt-12">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-2 text-foreground">
              Domande Frequenti (FAQ)
            </h2>
            
            <div className="grid gap-6 md:grid-cols-1">
              {jsonLd["@graph"][1].mainEntity.map((faq, index) => (
                <div 
                  key={index} 
                  className="group border border-border rounded-xl p-6 bg-card hover:bg-accent/5 transition-all duration-200 hover:border-primary/20 hover:shadow-lg"
                >
                  <h3 className="font-semibold text-lg mb-3 text-primary group-hover:text-primary/90">
                    {faq.name}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed text-sm md:text-base">
                    {faq.acceptedAnswer.text}
                  </p>
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
