export interface FAQItem {
  question: string;
  answer: string;
  category: "Costi & Tempi" | "Permessi & Normative" | "Design & AI" | "Servizi SYD";
  slug: string;
}

export const CATEGORY_ICONS = {
  "Costi & Tempi": "Coins",
  "Permessi & Normative": "FileText",
  "Design & AI": "Sparkles",
  "Servizi SYD": "Wrench",
} as const;

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
  {
    question: "Come funzionano i pagamenti?",
    answer: `
      <p class="font-medium text-lg mb-2">I pagamenti seguono un piano a <strong>SAL (Stato Avanzamento Lavori)</strong>, suddiviso in milestones concordate.</p>
      <p>Una struttura tipica prevede:</p>
      <ul class="list-disc pl-5 space-y-1 mt-2">
        <li><strong>20% alla firma del contratto:</strong> Avvio pratica e acquisto materiali.</li>
        <li><strong>30% a fine demolizioni e impianti:</strong> Completamento fase strutturale.</li>
        <li><strong>30% a fine finiture:</strong> Pavimenti, rivestimenti, tinteggiatura.</li>
        <li><strong>20% a collaudo finale:</strong> Saldo alla consegna con verbale di fine lavori.</li>
      </ul>
      <p class="mt-2">Tutti i pagamenti devono avvenire tramite <strong>bonifico parlante</strong> per accedere alle detrazioni fiscali.</p>
    `,
    category: "Costi & Tempi",
    slug: "pagamenti-sal"
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
  },
  {
    question: "I render AI sono vincolanti per il progetto finale?",
    answer: `
      <p class="font-medium text-lg mb-2">No, i render AI sono uno <strong>strumento di esplorazione</strong>, non un impegno contrattuale.</p>
      <p>Servono a:</p>
      <ul class="list-disc pl-5 space-y-1 mt-2">
        <li><strong>Visualizzare le possibilità:</strong> Testare stili, colori e materiali prima di decidere.</li>
        <li><strong>Comunicare con il team:</strong> Fornire un riferimento visivo chiaro per artigiani e fornitori.</li>
        <li><strong>Stimare i costi:</strong> I materiali nel render vengono usati per calcolare un preventivo realistico.</li>
      </ul>
      <p class="mt-2">Il progetto definitivo viene perfezionato insieme al nostro team tecnico sulla base delle tue preferenze emerse dai render.</p>
    `,
    category: "Design & AI",
    slug: "render-ai-vincolanti"
  },

  // --- Servizi SYD ---
  {
    question: "Cos'è lo Smart Remodel di SYD?",
    answer: `
      <p class="font-medium text-lg mb-2">Lo Smart Remodel è la nostra tecnica di ristrutturazione <strong>senza demolizioni</strong>, che riduce costi fino al 40% e tempi di cantiere a settimane.</p>
      <p>Utilizziamo materiali sovrapponibili di ultima generazione:</p>
      <ul class="list-disc pl-5 space-y-1 mt-2">
        <li><strong>Pavimenti SPC/LVT:</strong> Si posano sopra le piastrelle esistenti (spessore 4-6mm).</li>
        <li><strong>Microcemento e resine:</strong> Coprono pavimenti e pareti senza rimuovere il sottostante.</li>
        <li><strong>Wrapping mobili:</strong> Rinnovo cucina e bagno senza sostituzione dei mobili.</li>
      </ul>
      <p class="mt-2">Ideale per chi vuole rinnovare casa in tempi rapidi, senza polvere e con un budget contenuto.</p>
    `,
    category: "Servizi SYD",
    slug: "smart-remodel"
  },
  {
    question: "Come funziona il sopralluogo gratuito?",
    answer: `
      <p class="font-medium text-lg mb-2">Il sopralluogo è <strong>gratuito e senza impegno</strong>. Un nostro tecnico visita il tuo immobile per valutare lo stato attuale e le possibilità di intervento.</p>
      <p>Durante il sopralluogo:</p>
      <ol class="list-decimal pl-5 space-y-1 mt-2">
        <li>Rileviamo misure e fotografiamo gli ambienti.</li>
        <li>Discutiamo le tue esigenze e preferenze di stile.</li>
        <li>Identifichiamo eventuali criticità strutturali o impiantistiche.</li>
        <li>Entro 48 ore ricevi un preventivo dettagliato con render AI incluso.</li>
      </ol>
      <p class="mt-2">Per prenotare basta contattarci tramite il chatbot del sito o chiamare direttamente.</p>
    `,
    category: "Servizi SYD",
    slug: "sopralluogo-gratuito"
  },
  {
    question: "In quali zone operate?",
    answer: `
      <p class="font-medium text-lg mb-2">Operiamo in <strong>tutta Roma e Provincia</strong>, con copertura capillare nelle seguenti aree:</p>
      <ul class="list-disc pl-5 space-y-1 mt-2">
        <li><strong>Roma Centro e quartieri:</strong> Trastevere, Prati, EUR, Monteverde, Tuscolano, Appio.</li>
        <li><strong>Litorale:</strong> Fiumicino, Ostia, Ladispoli, Cerveteri.</li>
        <li><strong>Castelli Romani:</strong> Frascati, Albano Laziale, Ciampino, Marino.</li>
        <li><strong>Hinterland:</strong> Tivoli, Guidonia, Pomezia, Acilia, Bracciano.</li>
      </ul>
      <p class="mt-2">Per progetti premium gestiamo cantieri in tutta Italia tramite il nostro network di partner certificati.</p>
    `,
    category: "Servizi SYD",
    slug: "zone-operative"
  },
  {
    question: "Offrite servizi di ristrutturazione d'interni e arredamento?",
    answer: `
      <p class="font-medium text-lg mb-2">Sì, la <strong>ristrutturazione degli interni è la nostra attività principale (core business)</strong> e la nostra massima specializzazione.</p>
      <p>Ci occupiamo di trasformare integralmente i tuoi spazi. Per quanto riguarda la fase successiva di arredamento, lasciamo al cliente totale flessibilità:</p>
      <ul class="list-disc pl-5 space-y-1 mt-2">
        <li><strong>In autonomia:</strong> Puoi occuparti personalmente della scelta e dell'acquisto dei mobili per i tuoi nuovi spazi.</li>
        <li><strong>Tramite studi associati:</strong> Se desideri un servizio "chiavi in mano", SYD Bioedilizia collabora con <strong>studi di progettazione e arredamento partner</strong> che sapranno valorizzare al meglio la ristrutturazione.</li>
      </ul>
    `,
    category: "Servizi SYD",
    slug: "ristrutturazione-interni-arredi"
  }
];
