import Link from 'next/link';
import { ArrowRight, Camera, MapPin, MessageSquare, Ruler, Video } from 'lucide-react';
import { FAQAnswer } from '@/components/faq/FAQAnswer';
import { OpenChatButton } from '@/components/ui/open-chat-button';
import type { CompanyInfo } from '@/types/company-info';

interface CompanyContextStripProps {
  info: CompanyInfo;
}

const SYD_AGENT_CAPABILITIES = [
  {
    role: 'Triage & Analisi Visiva',
    summary:
      'Esamina foto, video e planimetrie caricati in chat per riconoscere stato di fatto, impianti, finiture e vincoli degli ambienti.',
  },
  {
    role: 'Design & Render 3D',
    summary:
      'Genera in pochi secondi proposte fotorealistiche coerenti con la geometria reale della stanza per testare materiali, illuminazione e stili.',
  },
  {
    role: 'Computo & Revisione Umana',
    summary:
      'Traduce le scelte progettuali in una bozza strutturata sul Prezzario Regione Lazio e listino SYD, sempre validata da un nostro tecnico prima del PDF finale.',
  },
];

const UPLOAD_PREPARATION_ITEMS = [
  {
    icon: Camera,
    label: '3-4 foto dagli angoli',
    recommendation: 'Luce naturale, inquadratura orizzontale',
    detail:
      'Riprendi pavimento, soffitto, finestre e gli eventuali punti acqua o caldaia per consentire un riconoscimento accurato di superfici e finiture.',
  },
  {
    icon: Ruler,
    label: 'Planimetria o schizzo quotato',
    recommendation: 'Anche catastale o disegnato a mano',
    detail:
      'Indica larghezza, lunghezza e altezza delle pareti: aiuta SYD a calcolare metri quadrati netti, tramezzi e quantità dei materiali.',
  },
  {
    icon: Video,
    label: 'Video panoramico (15-20 s)',
    recommendation: 'Carrellata lenta stanza per stanza',
    detail:
      'Mostra passaggi tra ambienti, termosifoni, quadri elettrici e infissi così riduci al minimo le domande di chiarimento in chat.',
  },
];

export function CompanyContextStrip({ info }: CompanyContextStripProps) {
  const { quote_terms, sections, service_area } = info;
  const bonusSection = sections.find((s) => s.slug === 'bonus-fiscali' && s.blocks.length > 0);
  const certSection = sections.find(
    (s) => s.slug === 'certificazioni-materiali' && s.blocks.length > 0
  );
  const webShortNotice = quote_terms.short_notice.replace(/\s*\(vedi\s+«[^»]+»\)\.?/i, '.');
  const highlightedZones =
    service_area.localities.length > 0
      ? service_area.localities.map((l) => l.name)
      : service_area.places.slice(0, 8);

  const steps = [
    {
      number: '01',
      title: 'Racconta o carica foto in chat',
      detail:
        'Descrivi ambienti, obiettivi e superfici in chat oppure allega planimetrie e foto dello stato attuale.',
    },
    {
      number: '02',
      title: 'Bozza tecnica con revisione umana SYD',
      detail:
        'Il computo viene strutturato per lavorazioni e verificato da un nostro tecnico prima della validazione.',
    },
    {
      number: '03',
      title: `Ricevi PDF valido ${quote_terms.validity_days} giorni`,
      detail: `Documento firmato via email con avanzamento lavori SAL (${quote_terms.payment_terms.join(' · ')}).`,
    },
  ];

  return (
    <div className="mt-16 space-y-8">
      {/* Blocco SYD: Cos'è il sistema agentico SYD */}
      <section
        aria-labelledby="faq-syd-agent-heading"
        className="rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-1"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-line">
          <div className="max-w-2xl">
            <h2 id="faq-syd-agent-heading" className="text-2xl font-serif font-bold text-ink">
              Cos&apos;è SYD: il nostro assistente AI agentico
            </h2>
            <p className="mt-2 text-sm text-ink-muted leading-relaxed text-pretty">
              SYD non è un risponditore automatico a risposte fisse, ma un sistema multi-agente
              progettato per accompagnarti dall&apos;idea alla stima tecnica insieme ai professionisti
              SYD Bioedilizia.
            </p>
          </div>
          <OpenChatButton
            prompt="Ciao SYD, vorrei capire come puoi aiutarmi a progettare e stimare la ristrutturazione di casa"
            className="bg-surface-muted hover:bg-canvas text-ink border-line text-sm px-4 py-2 shrink-0"
          >
            <MessageSquare className="w-4 h-4 text-primary-ink" aria-hidden="true" />
            Prova SYD in chat
          </OpenChatButton>
        </div>

        <dl className="divide-y divide-line">
          {SYD_AGENT_CAPABILITIES.map((cap) => (
            <div
              key={cap.role}
              className="py-4 sm:py-5 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-6 items-baseline"
            >
              <dt className="md:col-span-4 text-base font-serif font-semibold text-ink">
                {cap.role}
              </dt>
              <dd className="md:col-span-8 text-sm text-ink-muted leading-relaxed text-pretty">
                {cap.summary}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Blocco Checklist Upload: Cosa inviare a SYD per un preventivo preciso */}
      <section
        aria-labelledby="faq-upload-guide-heading"
        className="rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-1"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-line">
          <div className="max-w-2xl">
            <h2 id="faq-upload-guide-heading" className="text-2xl font-serif font-bold text-ink">
              Cosa inviare a SYD per un preventivo preciso
            </h2>
            <p className="mt-2 text-sm text-ink-muted leading-relaxed text-pretty">
              Più chiari sono i materiali iniziali, più rapida e fedele sarà la bozza di computo
              preparata prima della verifica del nostro tecnico.
            </p>
          </div>
          <OpenChatButton
            prompt="Ciao SYD, ho preparato foto e misure degli ambienti: da dove partiamo?"
            className="bg-surface-muted hover:bg-canvas text-ink border-line text-sm px-4 py-2 shrink-0"
          >
            <MessageSquare className="w-4 h-4 text-primary-ink" aria-hidden="true" />
            Invia i tuoi file a SYD
          </OpenChatButton>
        </div>

        <ul className="divide-y divide-line">
          {UPLOAD_PREPARATION_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <li
                key={item.label}
                className="py-4 sm:py-5 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-6 items-start"
              >
                <div className="md:col-span-4 flex items-start gap-2.5">
                  <Icon className="w-4 h-4 text-primary-ink shrink-0 mt-1" aria-hidden="true" />
                  <div>
                    <h3 className="text-base font-serif font-semibold text-ink">{item.label}</h3>
                    <p className="text-xs text-ink-subtle mt-0.5">{item.recommendation}</p>
                  </div>
                </div>
                <p className="md:col-span-8 text-sm text-ink-muted leading-relaxed text-pretty">
                  {item.detail}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Blocco A: Metodo in 3 fasi & condizioni preventivo */}
      <section
        aria-labelledby="faq-method-heading"
        className="rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-1"
      >
        <div className="max-w-2xl">
          <h2 id="faq-method-heading" className="text-2xl font-serif font-bold text-ink">
            Dal primo messaggio al preventivo
          </h2>
          <p className="mt-2 text-sm text-ink-muted leading-relaxed">{webShortNotice}</p>
        </div>

        <ol className="mt-6 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-line border-y border-line">
          {steps.map((step) => (
            <li key={step.number} className="py-5 md:py-6 md:px-6 first:md:pl-0 last:md:pr-0">
              <span
                aria-hidden="true"
                className="block font-serif text-lg font-bold text-primary-ink tabular-nums mb-1.5"
              >
                {step.number}
              </span>
              <h3 className="text-base font-semibold text-ink mb-1.5">{step.title}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{step.detail}</p>
            </li>
          ))}
        </ol>

        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <span className="inline-flex items-center rounded-full border border-line bg-surface-muted px-3 py-1 font-semibold text-ink">
            Validità {quote_terms.validity_days} giorni
          </span>
          {quote_terms.payment_terms.map((term) => (
            <span
              key={term}
              className="inline-flex items-center rounded-full border border-line bg-canvas px-3 py-1 text-ink"
            >
              {term}
            </span>
          ))}
        </div>
      </section>

      {/* Blocco B: Trasparenza, bonus e area operativa */}
      {(bonusSection || certSection || service_area.summary) && (
        <section
          aria-labelledby="faq-standards-heading"
          className="rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-1"
        >
          <h2 id="faq-standards-heading" className="text-2xl font-serif font-bold text-ink mb-6">
            Trasparenza, materiali e area operativa
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 space-y-6 divide-y divide-line text-pretty">
              {bonusSection && (
                <div className="first:pt-0 pt-6">
                  <h3 className="text-lg font-serif font-semibold text-ink mb-2">
                    {bonusSection.title}
                  </h3>
                  <FAQAnswer blocks={bonusSection.blocks} />
                </div>
              )}

              {certSection && (
                <div className="first:pt-0 pt-6">
                  <h3 className="text-lg font-serif font-semibold text-ink mb-2">
                    {certSection.title}
                  </h3>
                  <FAQAnswer blocks={certSection.blocks} />
                </div>
              )}
            </div>

            <aside className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-line pt-6 lg:pt-0 lg:pl-8 flex flex-col justify-between gap-6">
              <div>
                <h3 className="text-lg font-serif font-semibold text-ink mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary-ink shrink-0" aria-hidden="true" />
                  Dove lavoriamo
                </h3>
                <p className="text-sm text-ink-muted leading-relaxed mb-4">
                  {service_area.summary}
                </p>
                {highlightedZones.length > 0 && (
                  <p className="text-xs text-ink-subtle leading-relaxed">
                    Principali zone: {highlightedZones.join(' · ')} ({service_area.places.length}{' '}
                    comuni coperti)
                  </p>
                )}
              </div>

              <div className="pt-4 border-t border-line flex flex-wrap gap-3">
                <Link
                  href="/progetti"
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-full border border-line bg-canvas hover:bg-surface-muted text-sm font-medium text-ink transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Esplora i progetti
                  <ArrowRight className="w-4 h-4 text-primary-ink" aria-hidden="true" />
                </Link>
                <Link
                  href="/blog"
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-full border border-line bg-canvas hover:bg-surface-muted text-sm font-medium text-ink transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Guide tecniche
                  <ArrowRight className="w-4 h-4 text-primary-ink" aria-hidden="true" />
                </Link>
              </div>
            </aside>
          </div>
        </section>
      )}
    </div>
  );
}
