/**
 * Placeholder projects (stock photos with invented places): the gallery shows them
 * ONLY when the backend has no real project or cannot be reached, so the section
 * is never blank. They are not work of the company — `PortfolioData.isFallback`
 * keeps them out of structured data.
 */
import type { PortfolioItem } from './types';

export const defaultProjects: PortfolioItem[] = [
    {
        id: 'fallback-1',
        title: 'Villa Moderna',
        category: 'Soggiorno',
        location: 'Milano, City Life',
        image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?q=80&w=1974&auto=format&fit=crop',
        description: 'Ristrutturazione completa di un attico con vista panoramica. Stile minimalista con tocchi caldi in legno.',
        stats: { area: '120 mq', duration: '3 mesi', budget: '€85k' }
    },
    {
        id: 'fallback-2',
        title: 'Cucina Minimal',
        category: 'Cucina',
        location: 'Roma, Parioli',
        image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?q=80&w=2070&auto=format&fit=crop',
        description: 'Design open space con isola centrale in marmo Calacatta e illuminazione LED integrata.',
        stats: { area: '45 mq', duration: '4 settimane', budget: '€32k' }
    },
    {
        id: 'fallback-3',
        title: 'Luxury Spa',
        category: 'Bagno',
        location: 'Firenze, Centro',
        image: 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?q=80&w=1974&auto=format&fit=crop',
        description: 'Trasformazione di un bagno padronale in una spa privata con vasca freestanding e finiture in pietra.',
        stats: { area: '18 mq', duration: '3 settimane', budget: '€22k' }
    },
    {
        id: 'fallback-4',
        title: 'Loft Industriale',
        category: 'Intero Appartamento',
        location: 'Torino, Docks',
        image: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?q=80&w=2070&auto=format&fit=crop',
        description: 'Recupero di uno spazio industriale convertito in loft residenziale. Soppalchi in ferro e mattoni a vista.',
        stats: { area: '150 mq', duration: '5 mesi', budget: '€110k' }
    },
    {
        id: 'fallback-5',
        title: 'Camera Zen',
        category: 'Camera da letto',
        location: 'Como, Vista lago',
        image: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?q=80&w=2070&auto=format&fit=crop',
        description: 'Design ispirato al Japandi per una camera da letto che concilia il riposo. Toni neutri e materiali naturali.',
        stats: { area: '25 mq', duration: '2 settimane', budget: '€15k' }
    },
    {
        id: 'fallback-6',
        title: 'Home Office Tech',
        category: 'Ufficio',
        location: 'Milano, Isola',
        image: 'https://images.unsplash.com/photo-1593640408182-31c70c8268f5?q=80&w=2042&auto=format&fit=crop',
        description: 'Studio professionale domestico ottimizzato per lo smart working, con insonorizzazione e cablaggio avanzato.',
        stats: { area: '20 mq', duration: '2 settimane', budget: '€12k' }
    }
];
