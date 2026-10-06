/**
 * Blog articles index. Each article is a static page in app/blog/<id>/page.tsx;
 * this list feeds the /blog index page and app/sitemap.ts. Add new articles here.
 */
export interface BlogPostSummary {
    id: string;
    title: string;
    excerpt: string;
    image: string;
    category: string;
    /** Display date, e.g. "10 Mar 2026". */
    date: string;
    /** ISO date (YYYY-MM-DD), same as the article's own JSON-LD datePublished. */
    datePublished: string;
}

export const BLOG_POSTS: readonly BlogPostSummary[] = [
    {
        id: 'costi-ristrutturazione-casa-2026',
        title: "Quanto Costa Ristrutturare Casa nel 2026? Prezzi e ROI",
        excerpt: "Dai 600€ ai 1.200€/mq: analisi completa dei costi per cucina, bagno e impianti. Quali interventi aumentano davvero il valore dell'immobile.",
        image: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?q=80&w=800&auto=format&fit=crop",
        category: "Costi & Investimento",
        date: "10 Mar 2026",
        datePublished: "2026-03-10"
    },
    {
        id: 'smart-remodel-ristrutturazione-senza-demolire',
        title: "Smart Remodel: Ristrutturare Senza Demolire",
        excerpt: "Ristrutturazione senza demolizioni: pavimenti SPC, resine sovrapponibili e wrapping. Costi ridotti fino al 40% e cantiere in settimane.",
        image: "https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?q=80&w=800&auto=format&fit=crop",
        category: "Innovazione",
        date: "10 Mar 2026",
        datePublished: "2026-03-10"
    },
    {
        id: 'tendenze-layout-interni-2026',
        title: "Tendenze Layout Interni 2026: Addio Open Space",
        excerpt: "Spazi flessibili, color drenching e il ritorno delle pareti divisorie intelligenti. Le nuove regole del design d'interni.",
        image: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?q=80&w=800&auto=format&fit=crop",
        category: "Interior Design",
        date: "10 Mar 2026",
        datePublished: "2026-03-10"
    },
    {
        id: 'bonus-ristrutturazioni-2025-2026',
        title: "Bonus Ristrutturazioni 2026: La Guida Completa senza sorprese",
        excerpt: "Aliquote 50%, massimali e la checklist dei documenti obbligatori (CILA, Bonifici, ENEA) per non perdere le detrazioni fiscali.",
        image: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=800&auto=format&fit=crop",
        category: "Fisco & Normative",
        date: "21 Feb 2026",
        datePublished: "2026-02-21"
    },
    {
        id: 'umidita-risalita-roma',
        title: "Come eliminare definitivamente l'umidità di risalita nei palazzi storici romani",
        excerpt: "Una guida pratica per proprietari di immobili storici: diagnosi, costi e soluzioni definitive con la bioedilizia certificata.",
        image: "https://images.unsplash.com/photo-1464146072230-91cabc968266?q=80&w=800&auto=format&fit=crop",
        category: "Bioedilizia Storica",
        date: "20 Feb 2026",
        datePublished: "2026-02-20"
    },
    {
        id: 'tendenze-bagno-2026',
        title: "Tendenze 2026 per il Bagno: Materiali Ecologici e Design Minimalista",
        excerpt: "Scopri come trasformare il tuo bagno in un'oasi di benessere utilizzando resine ecocompatibili e illuminazione integrata.",
        image: "https://images.unsplash.com/photo-1620626011761-996317b8d101?q=80&w=800&auto=format&fit=crop",
        category: "Interior Design",
        date: "15 Feb 2026",
        datePublished: "2026-02-15"
    },
    {
        id: 'isolamento-acustico-interni',
        title: "Isolamento Acustico Naturale: Stop ai Rumori del Vicinato",
        excerpt: "Sistemi a secco e pannelli in fibra di legno o canapa per insonorizzare pareti divisorie e solette senza perdere troppo spazio.",
        image: "https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=800&auto=format&fit=crop",
        category: "Comfort Efficienza",
        date: "10 Feb 2026",
        datePublished: "2026-02-10"
    },
    {
        id: 'pavimenti-resina-vantaggi',
        title: "Pavimenti in Resina e Microcemento: Vantaggi e Applicazioni",
        excerpt: "Superfici continue e facili da pulire ideali per ristrutturazioni rapide: si possono posare direttamente sul pavimento esistente.",
        image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=800&auto=format&fit=crop",
        category: "Materiali",
        date: "05 Feb 2026",
        datePublished: "2026-02-05"
    }
];
