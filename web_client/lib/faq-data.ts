export interface FAQItem {
  question: string;
  answer: string; // Supports basic HTML/Markdown
  category: "Costi & Tempi" | "Permessi & Normative" | "Design & AI" | "Servizi SYD";
  slug: string;
}

export const FAQ_DATA: FAQItem[] = [
  // --- Costi & Tempi ---
  {
    question: "Quanto costa ristrutturare casa al mq nel 2026?",
    answer: `
      <p class="font-medium text-lg mb-2">Il costo medio per una ristrutturazione completa in Italia varia tra <strong>800€ e 1.200€ al mq</strong> per finiture standard.</p>
      <p>Per ristrutturazioni di lusso o interventi strutturali complessi, i prezzi possono superare i <strong>1.500€ al mq</strong>. I fattori principali che influenzano il prezzo sono:</p>
      <ul class="list-disc pl-5 space-y-1 mt-2">
        <li><strong>Demolizioni e Smaltimento:</strong> circa 10-15% del budget.</li>
        <li><strong>Impianti (Elettrico/Idraulico):</strong> rifacimento completo certificato.</li>
        <li><strong>Finiture:</strong> pavimenti, rivestimenti e infissi (voci più variabili).</li>
        <li><strong>Zona Geografica:</strong> Milano e Roma tendono ad avere costi del 15-20% superiori.</li>
      </ul>
    `,
    category: "Costi & Tempi",
    slug: "costo-ristrutturazione-mq"
  },
  {
    question: "Quanto tempo ci vuole per ristrutturare un appartamento di 100mq?",
    answer: `
      <p class="font-medium text-lg mb-2">Una ristrutturazione completa di 100mq richiede mediamente <strong>3-4 mesi di lavoro</strong> effettivo.</p>
      <p>Questa stima include:</p>
      <ul class="list-disc pl-5 space-y-1 mt-2">
        <li><strong>Settimana 1-2:</strong> Allestimento cantiere e demolizioni.</li>
        <li><strong>Settimana 3-6:</strong> Rifacimento impianti e sottofondi.</li>
        <li><strong>Settimana 7-10:</strong> Posa pavimenti, rivestimenti e intonaci.</li>
        <li><strong>Settimana 11-14:</strong> Tinteggiatura, montaggio infissi e finiture.</li>
      </ul>
      <p class="mt-2 text-sm text-muted-foreground">Nota: I tempi burocratici per CILA/SCIA (2-4 settimane) vanno calcolati prima dell'inizio lavori.</p>
    `,
    category: "Costi & Tempi",
    slug: "tempi-ristrutturazione-100mq"
  },

  // --- Permessi & Normative ---
  {
    question: "Quando serve la CILA e quando la SCIA?",
    answer: `
      <p class="font-medium text-lg mb-2">La <strong>CILA</strong> serve per spostare muri interni e rifare impianti (manutenzione straordinaria), mentre la <strong>SCIA</strong> è obbligatoria per modifiche strutturali.</p>
      <div class="mt-3 space-y-3">
        <div>
          <strong class="text-primary">CILA (Comunicazione Inizio Lavori Asseverata):</strong>
          <p class="text-sm">Obbligatoria per spostamento tramezzi, rifacimento bagni con modifiche impianto, unione/frazionamento senza cambio volumetria. Costo pratica: 500€ - 1.000€.</p>
        </div>
        <div>
          <strong class="text-primary">SCIA (Segnalazione Certificata Inizio Attività):</strong>
          <p class="text-sm">Necessaria per interventi sui muri portanti, solai, tetto o cambio di destinazione d'uso. Richiede calcoli strutturali dell'ingegnere.</p>
        </div>
      </div>
    `,
    category: "Permessi & Normative",
    slug: "differenza-cila-scia"
  },
  {
    question: "Quali Bonus Ristrutturazione sono attivi nel 2026?",
    answer: `
      <p class="font-medium text-lg mb-2">Nel 2026 è confermato il <strong>Bonus Ristrutturazione al 50%</strong> (o 36% a seconda delle ultime leggi di bilancio) con detrazione in 10 anni.</p>
      <p>Altri incentivi rilevanti:</p>
      <ul class="list-disc pl-5 space-y-1 mt-2">
        <li><strong>Ecobonus (50-65%):</strong> Per sostituzione infissi, caldaie e cappotto termico.</li>
        <li><strong>Bonus Mobili:</strong> Detrazione del 50% su arredi ed elettrodomestici in classe A+ (tetto spesa variabile).</li>
        <li><strong>Sismabonus:</strong> Per interventi di messa in sicurezza statica.</li>
      </ul>
      <p class="mt-2 font-semibold">Attenzione: Lo sconto in fattura e la cessione del credito non sono più disponibili per la maggior parte dei nuovi interventi.</p>
    `,
    category: "Permessi & Normative",
    slug: "bonus-ristrutturazione-2026"
  },

  // --- Design & AI ---
  {
    question: "Come funzionano i rendering AI di SYD?",
    answer: `
      <p class="font-medium text-lg mb-2">I rendering AI di SYD generano visualizzazioni fotorealistiche in <strong>meno di 30 secondi</strong> partendo da una semplice foto o planimetria.</p>
      <p>Utilizzando tecnologie avanzate (Google Gemini + Imagen 3), il nostro sistema:</p>
      <ol class="list-decimal pl-5 space-y-1 mt-2">
        <li>Analizza la geometria della tua stanza (muri, finestre, luci).</li>
        <li>Applica lo stile scelto (es. "Minimalista", "Industrial", "Scandinavo").</li>
        <li>Genera una proposta di arredo rispettando le proporzioni reali.</li>
      </ol>
      <p class="mt-2">A differenza dei render classici che richiedono giorni, con SYD puoi esplorare 10 varianti diverse in pochi minuti.</p>
    `,
    category: "Design & AI",
    slug: "funzionamento-render-ai"
  }
];
