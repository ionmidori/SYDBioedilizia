/**
 * FAQ content model.
 *
 * Answers are stored as structured, typed blocks — NOT raw HTML strings — so
 * they render through plain React elements and never touch dangerouslySetInnerHTML.
 * Inline emphasis is expressed with `**bold**` markers (see FAQAnswer.tsx), which
 * are turned into <strong> elements, never into HTML.
 */

/** Inline text; may contain `**bold**` segments. */
export type FaqInline = string;

export type FaqBlock =
  | { type: "lead"; text: FaqInline }
  | { type: "p"; text: FaqInline }
  | { type: "note"; text: FaqInline }
  | { type: "callout"; text: FaqInline }
  | { type: "ul"; items: FaqInline[] }
  | { type: "ol"; items: FaqInline[] }
  | { type: "definitions"; items: { term: FaqInline; description: FaqInline }[] };

export interface FAQItem {
  question: string;
  answer: FaqBlock[];
  category: "Costi & Tempi" | "Permessi & Normative" | "Design & AI" | "Servizi SYD";
  slug: string;
}

export const CATEGORY_ICONS = {
  "Costi & Tempi": "Coins",
  "Permessi & Normative": "FileText",
  "Design & AI": "Sparkles",
  "Servizi SYD": "Wrench",
} as const;

/**
 * Flatten a FAQ answer to plain text (no markers, no markup).
 * Used for the FAQPage JSON-LD `acceptedAnswer.text`.
 */
export function faqBlocksToPlainText(blocks: FaqBlock[]): string {
  const strip = (s: FaqInline) => s.replace(/\*\*/g, "");
  const parts: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "lead":
      case "p":
      case "note":
      case "callout":
        parts.push(strip(block.text));
        break;
      case "ul":
      case "ol":
        parts.push(block.items.map(strip).join(" "));
        break;
      case "definitions":
        parts.push(
          block.items.map((d) => `${strip(d.term)} ${strip(d.description)}`).join(" ")
        );
        break;
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export const FAQ_DATA: FAQItem[] = [
  // --- Costi & Tempi ---
  {
    question: "Quanto costa ristrutturare casa al mq nel 2026?",
    answer: [
      { type: "lead", text: "Il costo medio per una ristrutturazione completa in Italia varia tra **800€ e 1.200€ al mq** per finiture standard." },
      { type: "p", text: "Per ristrutturazioni di lusso o interventi strutturali complessi, i prezzi possono superare i **1.500€ al mq**. I fattori principali che influenzano il prezzo sono:" },
      { type: "ul", items: [
        "**Demolizioni e Smaltimento:** circa 10-15% del budget.",
        "**Impianti (Elettrico/Idraulico):** rifacimento completo certificato.",
        "**Finiture:** pavimenti, rivestimenti e infissi (voci più variabili).",
        "**Zona Geografica:** Milano e Roma tendono ad avere costi del 15-20% superiori.",
      ] },
    ],
    category: "Costi & Tempi",
    slug: "costo-ristrutturazione-mq"
  },
  {
    question: "Quanto tempo ci vuole per ristrutturare un appartamento di 100mq?",
    answer: [
      { type: "lead", text: "Una ristrutturazione completa di 100mq richiede mediamente **3-4 mesi di lavoro** effettivo." },
      { type: "p", text: "Questa stima include:" },
      { type: "ul", items: [
        "**Settimana 1-2:** Allestimento cantiere e demolizioni.",
        "**Settimana 3-6:** Rifacimento impianti e sottofondi.",
        "**Settimana 7-10:** Posa pavimenti, rivestimenti e intonaci.",
        "**Settimana 11-14:** Tinteggiatura, montaggio infissi e finiture.",
      ] },
      { type: "note", text: "Nota: I tempi burocratici per CILA/SCIA (2-4 settimane) vanno calcolati prima dell'inizio lavori." },
    ],
    category: "Costi & Tempi",
    slug: "tempi-ristrutturazione-100mq"
  },
  {
    question: "Come funzionano i pagamenti?",
    answer: [
      { type: "lead", text: "I pagamenti seguono un piano a **SAL (Stato Avanzamento Lavori)**, suddiviso in milestones concordate." },
      { type: "p", text: "Una struttura tipica prevede:" },
      { type: "ul", items: [
        "**20% alla firma del contratto:** Avvio pratica e acquisto materiali.",
        "**30% a fine demolizioni e impianti:** Completamento fase strutturale.",
        "**30% a fine finiture:** Pavimenti, rivestimenti, tinteggiatura.",
        "**20% a collaudo finale:** Saldo alla consegna con verbale di fine lavori.",
      ] },
      { type: "p", text: "Tutti i pagamenti devono avvenire tramite **bonifico parlante** per accedere alle detrazioni fiscali." },
    ],
    category: "Costi & Tempi",
    slug: "pagamenti-sal"
  },

  // --- Permessi & Normative ---
  {
    question: "Quando serve la CILA e quando la SCIA?",
    answer: [
      { type: "lead", text: "La **CILA** serve per spostare muri interni e rifare impianti (manutenzione straordinaria), mentre la **SCIA** è obbligatoria per modifiche strutturali." },
      { type: "definitions", items: [
        { term: "CILA (Comunicazione Inizio Lavori Asseverata):", description: "Obbligatoria per spostamento tramezzi, rifacimento bagni con modifiche impianto, unione/frazionamento senza cambio volumetria. Costo pratica: 500€ - 1.000€." },
        { term: "SCIA (Segnalazione Certificata Inizio Attività):", description: "Necessaria per interventi sui muri portanti, solai, tetto o cambio di destinazione d'uso. Richiede calcoli strutturali dell'ingegnere." },
      ] },
    ],
    category: "Permessi & Normative",
    slug: "differenza-cila-scia"
  },
  {
    question: "Quali Bonus Ristrutturazione sono attivi nel 2026?",
    answer: [
      { type: "lead", text: "Nel 2026 è confermato il **Bonus Ristrutturazione al 50%** (o 36% a seconda delle ultime leggi di bilancio) con detrazione in 10 anni." },
      { type: "p", text: "Altri incentivi rilevanti:" },
      { type: "ul", items: [
        "**Ecobonus (50-65%):** Per sostituzione infissi, caldaie e cappotto termico.",
        "**Bonus Mobili:** Detrazione del 50% su arredi ed elettrodomestici in classe A+ (tetto spesa variabile).",
        "**Sismabonus:** Per interventi di messa in sicurezza statica.",
      ] },
      { type: "callout", text: "Attenzione: Lo sconto in fattura e la cessione del credito non sono più disponibili per la maggior parte dei nuovi interventi." },
    ],
    category: "Permessi & Normative",
    slug: "bonus-ristrutturazione-2026"
  },

  // --- Design & AI ---
  {
    question: "Come funzionano i rendering AI di SYD?",
    answer: [
      { type: "lead", text: "I rendering AI di SYD generano visualizzazioni fotorealistiche in **meno di 30 secondi** partendo da una semplice foto o planimetria." },
      { type: "p", text: "Utilizzando tecnologie avanzate (Google Gemini + Imagen 3), il nostro sistema:" },
      { type: "ol", items: [
        "Analizza la geometria della tua stanza (muri, finestre, luci).",
        'Applica lo stile scelto (es. "Minimalista", "Industrial", "Scandinavo").',
        "Genera una proposta di arredo rispettando le proporzioni reali.",
      ] },
      { type: "p", text: "A differenza dei render classici che richiedono giorni, con SYD puoi esplorare 10 varianti diverse in pochi minuti." },
    ],
    category: "Design & AI",
    slug: "funzionamento-render-ai"
  },
  {
    question: "I render AI sono vincolanti per il progetto finale?",
    answer: [
      { type: "lead", text: "No, i render AI sono uno **strumento di esplorazione**, non un impegno contrattuale." },
      { type: "p", text: "Servono a:" },
      { type: "ul", items: [
        "**Visualizzare le possibilità:** Testare stili, colori e materiali prima di decidere.",
        "**Comunicare con il team:** Fornire un riferimento visivo chiaro per artigiani e fornitori.",
        "**Stimare i costi:** I materiali nel render vengono usati per calcolare un preventivo realistico.",
      ] },
      { type: "p", text: "Il progetto definitivo viene perfezionato insieme al nostro team tecnico sulla base delle tue preferenze emerse dai render." },
    ],
    category: "Design & AI",
    slug: "render-ai-vincolanti"
  },

  // --- Servizi SYD ---
  {
    question: "Cos'è lo Smart Remodel di SYD?",
    answer: [
      { type: "lead", text: "Lo Smart Remodel è la nostra tecnica di ristrutturazione **senza demolizioni**, che riduce costi fino al 40% e tempi di cantiere a settimane." },
      { type: "p", text: "Utilizziamo materiali sovrapponibili di ultima generazione:" },
      { type: "ul", items: [
        "**Pavimenti SPC/LVT:** Si posano sopra le piastrelle esistenti (spessore 4-6mm).",
        "**Microcemento e resine:** Coprono pavimenti e pareti senza rimuovere il sottostante.",
        "**Wrapping mobili:** Rinnovo cucina e bagno senza sostituzione dei mobili.",
      ] },
      { type: "p", text: "Ideale per chi vuole rinnovare casa in tempi rapidi, senza polvere e con un budget contenuto." },
    ],
    category: "Servizi SYD",
    slug: "smart-remodel"
  },
  {
    question: "Come funziona il sopralluogo gratuito?",
    answer: [
      { type: "lead", text: "Il sopralluogo è **gratuito e senza impegno**. Un nostro tecnico visita il tuo immobile per valutare lo stato attuale e le possibilità di intervento." },
      { type: "p", text: "Durante il sopralluogo:" },
      { type: "ol", items: [
        "Rileviamo misure e fotografiamo gli ambienti.",
        "Discutiamo le tue esigenze e preferenze di stile.",
        "Identifichiamo eventuali criticità strutturali o impiantistiche.",
        "Entro 48 ore ricevi un preventivo dettagliato con render AI incluso.",
      ] },
      { type: "p", text: "Per prenotare basta contattarci tramite il chatbot del sito o chiamare direttamente." },
    ],
    category: "Servizi SYD",
    slug: "sopralluogo-gratuito"
  },
  {
    question: "In quali zone operate?",
    answer: [
      { type: "lead", text: "Operiamo in **tutta Roma e Provincia**, con copertura capillare nelle seguenti aree:" },
      { type: "ul", items: [
        "**Roma Centro e quartieri:** Trastevere, Prati, EUR, Monteverde, Tuscolano, Appio.",
        "**Litorale:** Fiumicino, Ostia, Ladispoli, Cerveteri.",
        "**Castelli Romani:** Frascati, Albano Laziale, Ciampino, Marino.",
        "**Hinterland:** Tivoli, Guidonia, Pomezia, Acilia, Bracciano.",
      ] },
      { type: "p", text: "Per progetti premium gestiamo cantieri in tutta Italia tramite il nostro network di partner certificati." },
    ],
    category: "Servizi SYD",
    slug: "zone-operative"
  },
  {
    question: "Offrite servizi di ristrutturazione d'interni e arredamento?",
    answer: [
      { type: "lead", text: "Sì, la **ristrutturazione degli interni è la nostra attività principale (core business)** e la nostra massima specializzazione." },
      { type: "p", text: "Ci occupiamo di trasformare integralmente i tuoi spazi. Per quanto riguarda la fase successiva di arredamento, lasciamo al cliente totale flessibilità:" },
      { type: "ul", items: [
        "**In autonomia:** Puoi occuparti personalmente della scelta e dell'acquisto dei mobili per i tuoi nuovi spazi.",
        '**Tramite studi associati:** Se desideri un servizio "chiavi in mano", SYD Bioedilizia collabora con **studi di progettazione e arredamento partner** che sapranno valorizzare al meglio la ristrutturazione.',
      ] },
    ],
    category: "Servizi SYD",
    slug: "ristrutturazione-interni-arredi"
  }
];
