import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/sections/Navbar";
import { Footer } from "@/components/sections/Footer";

export const metadata: Metadata = {
  title: "Pagina non trovata",
  description:
    "La pagina richiesta non è disponibile su SYD Bioedilizia. Esplora i nostri progetti, gli articoli tecnici del blog o le risposte alle domande frequenti.",
  robots: {
    index: false,
    follow: true,
  },
};

const HELPFUL_LINKS = [
  {
    href: "/",
    label: "Home",
    description: "Torna alla pagina principale di SYD Bioedilizia",
  },
  {
    href: "/progetti",
    label: "Progetti",
    description: "Scopri le ristrutturazioni realizzate a Roma e provincia",
  },
  {
    href: "/blog",
    label: "Blog Tecnico",
    description: "Guide su bonus fiscali, materiali naturali e costi 2026",
  },
  {
    href: "/faq",
    label: "Domande Frequenti",
    description: "Risposte rapide su tempi, CILA/SCIA e preventivo AI",
  },
] as const;

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className="min-h-[75vh] bg-canvas text-ink py-16 px-4 md:px-8 flex items-center">
        <div className="max-w-3xl mx-auto w-full text-center">
          <p className="inline-block px-3 py-1 rounded-full bg-primary-subtle border border-primary/20 text-primary-ink text-xs font-bold uppercase tracking-wider mb-6">
            Errore 404
          </p>
          <h1 className="text-3xl md:text-5xl font-serif font-bold tracking-tight text-ink mb-4">
            Pagina non trovata
          </h1>
          <p className="text-lg text-ink-muted max-w-xl mx-auto mb-10 leading-relaxed">
            L&apos;indirizzo cercato non esiste o è stato spostato. Continua la navigazione dalle sezioni principali del sito.
          </p>

          <div className="mb-10">
            <Link
              href="/"
              className="inline-flex items-center justify-center min-h-[44px] px-7 py-3 rounded-full bg-primary hover:bg-primary/90 text-on-primary font-bold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              Torna alla Home
            </Link>
          </div>

          <nav
            aria-label="Collegamenti utili"
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left"
          >
            {HELPFUL_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block p-5 rounded-2xl bg-surface border border-line hover:border-primary/40 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                <span className="block font-serif font-bold text-lg text-ink mb-1">
                  {item.label}
                </span>
                <span className="block text-sm text-ink-muted">
                  {item.description}
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </main>
      <Footer />
    </>
  );
}

