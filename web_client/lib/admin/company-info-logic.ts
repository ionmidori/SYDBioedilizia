/**
 * Company info editor logic — pure functions, no I/O.
 *
 * The backend (`PutCompanyInfoBody`) is the authority: this mirrors its rules through the same zod
 * schema (`companyInfoSchema`) so the admin sees problems, on the right tab and field, before saving,
 * and previews which parts of the company info a save changes.
 */
import { companyInfoSchema, type CompanyInfo } from '@/types/company-info';

export type CompanyTab =
    | 'identity'
    | 'hours'
    | 'area'
    | 'services'
    | 'site_visit'
    | 'quote_terms'
    | 'sections'
    | 'faq'
    | 'about';

export const COMPANY_TABS: { id: CompanyTab; label: string }[] = [
    { id: 'identity', label: 'Identità e contatti' },
    { id: 'hours', label: 'Orari' },
    { id: 'area', label: 'Zone' },
    { id: 'services', label: 'Lavori' },
    { id: 'site_visit', label: 'Sopralluogo' },
    { id: 'quote_terms', label: 'Preventivo' },
    { id: 'sections', label: 'Sezioni' },
    { id: 'faq', label: 'FAQ' },
    { id: 'about', label: 'Chi siamo' },
];

/** What a part of the company info is called in the save dialog and in the history. */
export const PART_LABELS: Record<keyof CompanyInfo, string> = {
    identity: 'Identità e contatti',
    hours: 'Orari',
    hours_note: 'Note sugli orari',
    service_area: 'Zone servite',
    services: 'Lavori svolti',
    site_visit: 'Sopralluogo',
    quote_terms: 'Condizioni del preventivo',
    home_services: 'Servizi della home',
    sections: 'Sezioni',
    faq_categories: 'Categorie FAQ',
    faq: 'FAQ',
    about: 'Chi siamo',
};

const TAB_OF_PART: Record<keyof CompanyInfo, CompanyTab> = {
    identity: 'identity',
    hours: 'hours',
    hours_note: 'hours',
    service_area: 'area',
    services: 'services',
    home_services: 'services',
    site_visit: 'site_visit',
    quote_terms: 'quote_terms',
    sections: 'sections',
    faq: 'faq',
    faq_categories: 'faq',
    about: 'about',
};

export function tabOfPart(part: keyof CompanyInfo): CompanyTab {
    return TAB_OF_PART[part];
}

/** JSON with sorted keys: the same value always gives the same text, whatever its key order. */
function stable(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
}

/** The top-level parts that differ, sorted: the same rule as the backend's `changed_parts`. */
export function changedParts(before: CompanyInfo, after: CompanyInfo): (keyof CompanyInfo)[] {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof CompanyInfo>;
    return [...keys].filter((key) => stable(before[key]) !== stable(after[key])).sort();
}

export interface CompanyIssue {
    tab: CompanyTab;
    path: (string | number)[];
    /** The id of the input to focus (`company-identity-phone`); a tab-level problem has the part's id. */
    fieldId: string;
    message: string;
}

interface RawIssue {
    code: string;
    path: PropertyKey[];
    message: string;
    origin?: string;
    minimum?: number | bigint;
    input?: unknown;
}

function describeIssue(issue: RawIssue): string {
    switch (issue.code) {
        case 'too_small':
            if (issue.origin === 'string') return Number(issue.minimum) <= 1 ? 'Campo obbligatorio' : `Almeno ${issue.minimum} caratteri`;
            if (issue.origin === 'array') return Number(issue.minimum) <= 1 ? 'Aggiungi almeno un elemento' : `Almeno ${issue.minimum} elementi`;
            return 'Valore troppo basso';
        case 'too_big':
            if (issue.origin === 'string') return 'Troppo lungo';
            if (issue.origin === 'array') return 'Troppi elementi';
            return 'Valore troppo alto';
        case 'invalid_format':
            return 'Formato non valido';
        case 'invalid_type':
            return issue.input === undefined ? 'Campo obbligatorio' : 'Valore non valido';
        default:
            // `custom`: the schema's own Italian message (phone, hours, duplicates, links…).
            return issue.message;
    }
}

/** The problems of a company info, as the backend would refuse it, each on its tab and field. */
export function validateCompanyInfo(info: CompanyInfo): CompanyIssue[] {
    const result = companyInfoSchema.safeParse(info);
    if (result.success) return [];
    return result.error.issues.map((raw) => {
        const issue = raw as unknown as RawIssue;
        const path = issue.path.filter((p): p is string | number => typeof p !== 'symbol');
        const head = path[0];
        const tab = typeof head === 'string' && head in TAB_OF_PART ? TAB_OF_PART[head as keyof CompanyInfo] : COMPANY_TABS[0].id;
        return {
            tab,
            path,
            fieldId: path.length > 0 ? `company-${path.join('-')}` : 'company-info',
            message: describeIssue(issue),
        };
    });
}

const SLUG_MAX = 60;

/** "Città più belle" → "citta-piu-belle": the slug a new section or FAQ gets from its title. */
export function slugify(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, SLUG_MAX)
        .replace(/-+$/, '');
}

/** A copy of the list with one item moved; the list itself when a place is out of range. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
    const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < list.length;
    if (!inRange(from) || !inRange(to)) return [...list];
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

/** A section a FAQ is linked to cannot be deleted. */
export function sectionInUse(info: CompanyInfo, slug: string): boolean {
    return info.faq.some((item) => item.section_slug === slug);
}
