/**
 * "Cosa facciamo" content model — the trades SYD carries out, in display order.
 *
 * Descriptions are kept to a similar length on purpose: every card shares one
 * aspect ratio and grows only if its text needs more room, so a much longer
 * description makes its card taller than the others.
 */
import {
    AirVent,
    AppWindow,
    Bath,
    Building2,
    Grid3x3,
    Zap,
    type LucideIcon,
} from 'lucide-react';

export interface Activity {
    id: string;
    title: string;
    description: string;
    icon: LucideIcon;
    /** Trade shown in the card's spec-sheet header ("Scheda lavorazione · …"). */
    discipline: string;
}

export const activities: Activity[] = [
    {
        id: 'appartamento',
        title: 'Ristrutturazione completa appartamento',
        description:
            'Chiavi in mano: progettazione, pratiche edilizie (CILA/SCIA), demolizioni e tramezzature, impianti a norma, massetti, finiture e direzione lavori.',
        icon: Building2,
        discipline: 'Edile',
    },
    {
        id: 'bagno',
        title: 'Rifacimento bagno',
        description:
            'Demolizione e smaltimento, rifacimento impianto idrico-sanitario e scarichi, impermeabilizzazione, posa di rivestimenti, sanitari sospesi e piatti doccia a filo pavimento.',
        icon: Bath,
        discipline: 'Idraulica',
    },
    {
        id: 'infissi',
        title: 'Sostituzione infissi',
        description:
            'Serramenti a taglio termico in PVC, alluminio o legno-alluminio con vetrocamera basso-emissivo, posa qualificata secondo UNI 11673 e accesso alle detrazioni fiscali.',
        icon: AppWindow,
        discipline: 'Serramenti',
    },
    {
        id: 'climatizzazione',
        title: 'Climatizzazione',
        description:
            'Fornitura e installazione di sistemi mono e multi-split a pompa di calore ad alta efficienza, sostituzione di impianti esistenti e installazione certificata F-Gas.',
        icon: AirVent,
        discipline: 'Termotecnica',
    },
    {
        id: 'impianto-elettrico',
        title: 'Rifacimento impianto elettrico',
        description:
            'Impianto conforme alla norma CEI 64-8, nuovo quadro con protezioni differenziali e magnetotermiche, predisposizione domotica e Dichiarazione di Conformità (DM 37/08).',
        icon: Zap,
        discipline: 'Elettrica',
    },
    {
        id: 'piastrelle',
        title: 'Posa piastrelle',
        description:
            "Posa a regola d'arte di gres porcellanato, grandi formati e mosaici: preparazione e livellamento del sottofondo, fughe e sigillature epossidiche.",
        icon: Grid3x3,
        discipline: 'Finiture',
    },
];
