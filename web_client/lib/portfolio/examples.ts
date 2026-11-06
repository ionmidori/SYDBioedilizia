/**
 * Example projects (stock photos): the gallery adds them AFTER the real projects
 * until it has `PORTFOLIO_MIN_CARDS` cards, so it never looks empty while the
 * portfolio is growing. They are not work of the company, so they are always
 * shown with an "Esempio" label, carry no place, size, duration or budget, and
 * never reach structured data (JSON-LD). Each real project published from the
 * Console pushes one of them out.
 */
import type { PortfolioItem } from './types';

const NO_STATS = { area: '', duration: '', budget: '' };

export const exampleProjects: PortfolioItem[] = [
    {
        id: 'example-1',
        title: 'Soggiorno moderno',
        category: 'Soggiorno',
        location: '',
        image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?q=80&w=1974&auto=format&fit=crop',
        description: 'Stile minimalista con tocchi caldi in legno e grandi aperture verso l’esterno.',
        stats: NO_STATS,
    },
    {
        id: 'example-2',
        title: 'Cucina minimal',
        category: 'Cucina',
        location: '',
        image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?q=80&w=2070&auto=format&fit=crop',
        description: 'Open space con isola centrale in marmo e illuminazione LED integrata.',
        stats: NO_STATS,
    },
    {
        id: 'example-3',
        title: 'Bagno spa',
        category: 'Bagno',
        location: '',
        image: 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?q=80&w=1974&auto=format&fit=crop',
        description: 'Vasca freestanding e finiture in pietra per un bagno padronale.',
        stats: NO_STATS,
    },
    {
        id: 'example-4',
        title: 'Loft industriale',
        category: 'Intero Appartamento',
        location: '',
        image: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?q=80&w=2070&auto=format&fit=crop',
        description: 'Spazio aperto con soppalco in ferro e mattoni a vista.',
        stats: NO_STATS,
    },
    {
        id: 'example-5',
        title: 'Camera zen',
        category: 'Camera da letto',
        location: '',
        image: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?q=80&w=2070&auto=format&fit=crop',
        description: 'Ispirazione Japandi: toni neutri e materiali naturali per il riposo.',
        stats: NO_STATS,
    },
    {
        id: 'example-6',
        title: 'Home office',
        category: 'Ufficio',
        location: '',
        image: 'https://images.unsplash.com/photo-1593640408182-31c70c8268f5?q=80&w=2042&auto=format&fit=crop',
        description: 'Studio domestico per lo smart working, con insonorizzazione e cablaggio dedicato.',
        stats: NO_STATS,
    },
];
