/**
 * Schema.org data (JSON-LD) of the business, built from the company info: what
 * Google and the answer engines read about SYD (contacts, area served, hours,
 * works). Nothing here is a company fact of its own: an edit in the admin console
 * reaches the site's structured data with the next revalidation.
 */
import { STRUCTURED_DATA_LOGO } from '@/lib/brand';
import { SITE_URL } from '@/lib/site';
import type { Block, CompanyInfo, Section } from '@/types/company-info';

const stripEmphasis = (text: string): string => text.replace(/\*\*/g, '');

function flattenBlockLines(blocks: readonly Block[]): string[] {
    const lines: string[] = [];
    for (const block of blocks) {
        switch (block.type) {
            case 'lead':
            case 'p':
            case 'note':
            case 'callout':
                lines.push(stripEmphasis(block.text));
                break;
            case 'ul':
            case 'ol':
                lines.push(...block.items.map(stripEmphasis));
                break;
            case 'definitions':
                lines.push(...block.items.map((d) => `${stripEmphasis(d.term)}: ${stripEmphasis(d.description)}`));
                break;
        }
    }
    return lines;
}

/**
 * Extracts verified `https://` social profile URLs from the dynamic `social` section
 * without hardcoding handles in code or accepting unsafe schemes (`javascript:`, `http:`).
 */
export function extractSocialUrls(sections: readonly Section[]): string[] {
    const socialSection = sections.find((section) => section.slug === 'social');
    if (!socialSection || socialSection.blocks.length === 0) return [];

    const urls = new Set<string>();
    for (const line of flattenBlockLines(socialSection.blocks)) {
        const ig = /Instagram:\s*@([A-Za-z0-9._]+)/i.exec(line);
        if (ig) urls.add(`https://www.instagram.com/${ig[1]}/`);

        const tt = /TikTok:\s*@([A-Za-z0-9._]+)/i.exec(line);
        if (tt) urls.add(`https://www.tiktok.com/@${tt[1]}`);

        for (const match of line.matchAll(/https:\/\/[^\s)]+/gi)) {
            try {
                const parsed = new URL(match[0]);
                if (parsed.protocol === 'https:') urls.add(parsed.toString());
            } catch {
                // Ignore malformed URLs authored in the admin console.
            }
        }
    }
    return [...urls];
}

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
export function businessJsonLd(
    info: CompanyInfo,
    options?: { imageUrl?: string },
): Record<string, unknown> {
    const { identity, services, service_area, hours, sections } = info;
    const openingHours = hours.flatMap((row) => {
        const dayOfWeek = parseItalianDays(row.days);
        return dayOfWeek ? [{ '@type': 'OpeningHoursSpecification', dayOfWeek, opens: row.opens, closes: row.closes }] : [];
    });
    const sameAs = extractSocialUrls(sections);
    return {
        '@context': 'https://schema.org',
        '@type': 'GeneralContractor',
        '@id': `${SITE_URL}/#business`,
        name: identity.name,
        legalName: identity.legal_name,
        description: services.summary,
        url: SITE_URL,
        logo: `${SITE_URL}${STRUCTURED_DATA_LOGO.url}`,
        image: options?.imageUrl ?? `${SITE_URL}${STRUCTURED_DATA_LOGO.url}`,
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
        geo: {
            '@type': 'GeoCoordinates',
            latitude: 41.9028,
            longitude: 12.4964,
        },
        areaServed: [
            ...service_area.places.map((name) => ({ '@type': 'City', name })),
            { '@type': 'AdministrativeArea', name: service_area.summary },
        ],
        ...(sameAs.length > 0 && { sameAs }),
        ...(openingHours.length > 0 && { openingHoursSpecification: openingHours }),
        knowsAbout: services.items.map((item) => item.title),
        priceRange: '€€€',
    };
}
