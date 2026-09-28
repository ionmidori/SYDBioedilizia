/**
 * "Tecnologia al servizio del Design" content model — the three service cards
 * rendered by `components/sections/Services.tsx`, in display order.
 *
 * What a card does on click is `action`, never inferred from the visible title:
 * rewording a title must not silently change where the card leads.
 */
import {
    HardHat,
    LayoutDashboard,
    Wand2,
    type LucideIcon,
} from 'lucide-react';

/** `dashboard` opens the personal area (login first if needed); `chat` opens the AI chat. */
export type ServiceAction = 'dashboard' | 'chat';

export interface Service {
    id: string;
    icon: LucideIcon;
    title: string;
    description: string;
    action: ServiceAction;
}

export const services: Service[] = [
    {
        id: 'area-personale',
        icon: LayoutDashboard,
        title: 'Area personale',
        description: 'Controlla ogni aspetto del cantiere dalla tua area personale: avanzamento lavori, documenti, fatture e comunicazioni con il team.',
        action: 'dashboard',
    },
    {
        id: 'design-ai',
        icon: Wand2,
        title: 'Design AI e Preventivi Veloci',
        description: 'Genera centinaia di varianti di design per la tua casa in pochi secondi e ottieni subito una stima dettagliata dei costi, revisionata dal nostro team tecnico in tempi record.',
        action: 'chat',
    },
    {
        id: 'direzione-lavori',
        icon: HardHat,
        title: 'Direzione Lavori e Consegna',
        description: 'I nostri architetti partner seguono il cantiere passo dopo passo e gestiamo tutto noi, dalla burocrazia alle pulizie finali: ti consegniamo una casa pronta da vivere.',
        action: 'chat',
    },
];
