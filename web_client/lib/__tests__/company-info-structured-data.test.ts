import { businessJsonLd, parseItalianDays } from '@/lib/company-info/structured-data';
import { SEED_COMPANY_INFO } from '@/lib/company-info/seed';
import { SITE_URL } from '@/lib/site';
import type { CompanyInfo } from '@/types/company-info';

const day = (name: string) => `https://schema.org/${name}`;

describe('parseItalianDays', () => {
    it.each([
        ['Lun-Ven', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']],
        ['lunedì - venerdì', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']],
        ['Sabato', ['Saturday']],
        ['Lun, Mer e Ven', ['Monday', 'Wednesday', 'Friday']],
        ['Sab-Lun', ['Saturday', 'Sunday', 'Monday']],
        ['Domenica', ['Sunday']],
    ])('reads "%s"', (text, days) => {
        expect(parseItalianDays(text)).toEqual(days.map(day));
    });

    it.each(['su appuntamento', '', 'Lun-Xyz', 'martedì prossimo', 'Lun-'])('cannot read "%s"', (text) => {
        expect(parseItalianDays(text)).toBeNull();
    });
});

describe('businessJsonLd', () => {
    const { identity, services, service_area } = SEED_COMPANY_INFO;
    const ld = businessJsonLd(SEED_COMPANY_INFO) as Record<string, unknown> & {
        areaServed: { '@type': string; name: string }[];
        address: Record<string, string>;
    };

    it('describes the company of the company info', () => {
        expect(ld['@type']).toBe('GeneralContractor');
        expect(ld['@id']).toBe(`${SITE_URL}/#business`);
        expect(ld.url).toBe(SITE_URL);
        expect(ld.name).toBe(identity.name);
        expect(ld.legalName).toBe(identity.legal_name);
        expect(ld.telephone).toBe(identity.phone);
        expect(ld.email).toBe(identity.email);
        expect(ld.vatID).toBe(`IT${identity.vat_id}`);
        expect(ld.address).toEqual({
            '@type': 'PostalAddress',
            streetAddress: identity.address.street,
            postalCode: identity.address.postal_code,
            addressLocality: identity.address.city,
            addressRegion: identity.address.region,
            addressCountry: identity.address.country,
        });
    });

    it('takes the description and the works from the services of the company info', () => {
        expect(ld.description).toBe(services.summary);
        expect(ld.knowsAbout).toEqual(services.items.map((i) => i.title));
    });

    it('serves every comune of the area, plus the area as a whole', () => {
        const cities = ld.areaServed.filter((a) => a['@type'] === 'City');
        expect(cities.map((c) => c.name)).toEqual(service_area.places);
        expect(ld.areaServed.filter((a) => a['@type'] === 'AdministrativeArea')).toEqual([
            { '@type': 'AdministrativeArea', name: service_area.summary },
        ]);
    });

    it('has no opening hours when the company info has none', () => {
        expect(SEED_COMPANY_INFO.hours).toEqual([]);
        expect(ld).not.toHaveProperty('openingHoursSpecification');
    });

    it('describes the hours it can read and skips the ones it cannot', () => {
        const info: CompanyInfo = {
            ...SEED_COMPANY_INFO,
            hours: [
                { days: 'Lun-Ven', opens: '09:00', closes: '18:00' },
                { days: 'su appuntamento', opens: '10:00', closes: '12:00' },
            ],
        };
        expect(businessJsonLd(info).openingHoursSpecification).toEqual([
            {
                '@type': 'OpeningHoursSpecification',
                dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day),
                opens: '09:00',
                closes: '18:00',
            },
        ]);
    });

    it('omits the hours when none can be read', () => {
        const info: CompanyInfo = {
            ...SEED_COMPANY_INFO,
            hours: [{ days: 'su appuntamento', opens: '10:00', closes: '12:00' }],
        };
        expect(businessJsonLd(info)).not.toHaveProperty('openingHoursSpecification');
    });
});
