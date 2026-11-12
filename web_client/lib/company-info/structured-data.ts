/**
 * Schema.org data (JSON-LD) of the business, built from the company info: what
 * Google and the answer engines read about SYD (contacts, area served, hours,
 * works). Nothing here is a company fact of its own: an edit in the admin console
 * reaches the site's structured data with the next revalidation.
 */
import { STRUCTURED_DATA_LOGO } from '@/lib/brand';
import { SITE_URL } from '@/lib/site';
import type { CompanyInfo } from '@/types/company-info';

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** Italian day names, short and full, without accents (see `plain`). */
const DAY_INDEX: Record<string, number> = {
    lun: 0, lunedi: 0,
    mar: 1, martedi: 1,
    mer: 2, mercoledi: 2,
    gio: 3, giovedi: 3,
    ven: 4, venerdi: 4,
    sab: 5, sabato: 5,
    dom: 6, domenica: 6,
};

/** Lowercase, no accents, no trailing dot: "Lunedì." → "lunedi". */
const plain = (text: string): string =>
    text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\.$/, '');

/**
 * Schema.org day URLs for an hours row written in Italian: "Lun-Ven", "Sabato",
 * "Lun, Mer e Ven", "Sab-Lun" (a range may wrap the week). Anything else
 * ("su appuntamento") is null: a free-text row must not become invalid markup.
 */
export function parseItalianDays(days: string): string[] | null {
    const indexes: number[] = [];
    for (const part of days.split(/\s*,\s*|\s+e\s+/i)) {
        const ends = part.split(/\s*-\s*/).map((token) => DAY_INDEX[plain(token)]);
        if (ends.length > 2 || ends.some((index) => index === undefined)) return null;
        const [start, end = start] = ends;
        const range = end >= start
            ? Array.from({ length: end - start + 1 }, (_, i) => start + i)
            : [...Array.from({ length: 7 - start }, (_, i) => start + i), ...Array.from({ length: end + 1 }, (_, i) => i)];
        for (const index of range) if (!indexes.includes(index)) indexes.push(index);
    }
    return indexes.length > 0 ? indexes.map((index) => `https://schema.org/${WEEK[index]}`) : null;
}

/** The homepage's `GeneralContractor` node (its `@id` is referenced by the portfolio JSON-LD). */
export function businessJsonLd(info: CompanyInfo): Record<string, unknown> {
    const { identity, services, service_area, hours } = info;
    const openingHours = hours.flatMap((row) => {
        const dayOfWeek = parseItalianDays(row.days);
        return dayOfWeek ? [{ '@type': 'OpeningHoursSpecification', dayOfWeek, opens: row.opens, closes: row.closes }] : [];
    });
    return {
        '@context': 'https://schema.org',
        '@type': 'GeneralContractor',
        '@id': `${SITE_URL}/#business`,
        name: identity.name,
        legalName: identity.legal_name,
        description: services.summary,
        url: SITE_URL,
        logo: `${SITE_URL}${STRUCTURED_DATA_LOGO.url}`,
        image: `${SITE_URL}${STRUCTURED_DATA_LOGO.url}`,
        telephone: identity.phone,
        email: identity.email,
        vatID: `IT${identity.vat_id}`,
        address: {
            '@type': 'PostalAddress',
            streetAddress: identity.address.street,
            postalCode: identity.address.postal_code,
            addressLocality: identity.address.city,
            addressRegion: identity.address.region,
            addressCountry: identity.address.country,
        },
        areaServed: [
            ...service_area.places.map((name) => ({ '@type': 'City', name })),
            { '@type': 'AdministrativeArea', name: service_area.summary },
        ],
        ...(openingHours.length > 0 && { openingHoursSpecification: openingHours }),
        knowsAbout: services.items.map((item) => item.title),
        priceRange: '€€€',
    };
}
