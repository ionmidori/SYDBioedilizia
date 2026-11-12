import { SEED_COMPANY_INFO } from '@/lib/company-info/seed';
import {
    changedParts,
    COMPANY_TABS,
    moveItem,
    PART_LABELS,
    sectionInUse,
    slugify,
    tabOfPart,
    validateCompanyInfo,
} from '@/lib/admin/company-info-logic';
import type { CompanyInfo } from '@/types/company-info';

const seed = (): CompanyInfo => JSON.parse(JSON.stringify(SEED_COMPANY_INFO));

describe('tabs and part labels', () => {
    it('has the nine tabs of the console, in order', () => {
        expect(COMPANY_TABS.map((t) => t.id)).toEqual([
            'identity', 'hours', 'area', 'services', 'site_visit', 'quote_terms', 'sections', 'faq', 'about',
        ]);
    });

    it('names every part of the company info in Italian', () => {
        for (const part of Object.keys(seed()) as (keyof CompanyInfo)[]) {
            expect(PART_LABELS[part]).toBeTruthy();
        }
    });

    it('puts every part on a tab', () => {
        const ids = new Set(COMPANY_TABS.map((t) => t.id));
        for (const part of Object.keys(seed()) as (keyof CompanyInfo)[]) expect(ids.has(tabOfPart(part))).toBe(true);
        expect(tabOfPart('hours_note')).toBe('hours');
        expect(tabOfPart('service_area')).toBe('area');
        expect(tabOfPart('home_services')).toBe('services');
        expect(tabOfPart('faq_categories')).toBe('faq');
    });
});

describe('changedParts', () => {
    it('is empty for the same info', () => {
        expect(changedParts(seed(), seed())).toEqual([]);
    });

    it('names the top-level parts that differ, sorted', () => {
        const after = seed();
        after.identity.phone = '06 123456';
        expect(changedParts(seed(), after)).toEqual(['identity']);
        after.hours_note = 'Estate';
        after.faq = [];
        expect(changedParts(seed(), after)).toEqual(['faq', 'hours_note', 'identity']);
    });

    it('ignores the order of the keys inside an object', () => {
        const after = seed();
        after.identity = Object.fromEntries(Object.entries(after.identity).reverse()) as CompanyInfo['identity'];
        expect(changedParts(seed(), after)).toEqual([]);
    });
});

describe('validateCompanyInfo', () => {
    it('finds no problem in the seed', () => {
        expect(validateCompanyInfo(seed())).toEqual([]);
    });

    it('puts a phone problem on the identity tab, on the phone field', () => {
        const info = seed();
        info.identity.phone = '06';
        const [issue] = validateCompanyInfo(info);
        expect(issue).toMatchObject({ tab: 'identity', fieldId: 'company-identity-phone' });
        expect(issue.message).toMatch(/cifre/);
    });

    it('says "Campo obbligatorio" for an empty required text', () => {
        const info = seed();
        info.about.title = '';
        expect(validateCompanyInfo(info)).toContainEqual(
            expect.objectContaining({ tab: 'about', fieldId: 'company-about-title', message: 'Campo obbligatorio' }),
        );
    });

    it('says "Troppo lungo" for a text over its limit', () => {
        const info = seed();
        info.identity.name = 'x'.repeat(121);
        expect(validateCompanyInfo(info)).toContainEqual(
            expect.objectContaining({ tab: 'identity', message: 'Troppo lungo' }),
        );
    });

    it('puts a FAQ linked to a missing section on the faq tab', () => {
        const info = seed();
        info.faq[0] = { ...info.faq[0], section_slug: 'non-esiste' };
        expect(validateCompanyInfo(info)).toContainEqual(expect.objectContaining({ tab: 'faq' }));
    });

    it('puts a locality whose comune left the list on the area tab', () => {
        const info = seed();
        info.service_area.localities = [{ name: 'Casal Bertone', comune: 'Comune che non c’è' }];
        expect(validateCompanyInfo(info)).toContainEqual(expect.objectContaining({ tab: 'area' }));
    });

    it('puts two sections with the same slug on the sections tab', () => {
        const info = seed();
        info.sections.push({ ...info.sections[0] });
        expect(validateCompanyInfo(info)).toContainEqual(expect.objectContaining({ tab: 'sections' }));
    });

    it('has an input id for every issue', () => {
        const info = seed();
        info.identity.phone = '06';
        info.about.title = '';
        for (const issue of validateCompanyInfo(info)) expect(issue.fieldId).toMatch(/^company-[a-z_0-9-]+$/);
    });
});

describe('slugify', () => {
    it.each([
        ['Garanzie & Assistenza Post-Vendita', 'garanzie-assistenza-post-vendita'],
        ['Città più belle', 'citta-piu-belle'],
        ['  --Ciao  mondo--  ', 'ciao-mondo'],
        ['', ''],
    ])('turns "%s" into "%s"', (text, slug) => {
        expect(slugify(text)).toBe(slug);
    });

    it('cuts the slug at 60 characters without a trailing dash', () => {
        const slug = slugify('parola '.repeat(20));
        expect(slug.length).toBeLessThanOrEqual(60);
        expect(slug.endsWith('-')).toBe(false);
    });
});

describe('moveItem', () => {
    it('moves an item from one place to another', () => {
        expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
        expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    });

    it('returns the list unchanged when a place is out of range, and never changes the input', () => {
        const list = ['a', 'b'];
        expect(moveItem(list, 0, 5)).toEqual(['a', 'b']);
        expect(moveItem(list, -1, 0)).toEqual(['a', 'b']);
        moveItem(list, 0, 1);
        expect(list).toEqual(['a', 'b']);
    });
});

describe('sectionInUse', () => {
    it('is true when a FAQ is linked to the section', () => {
        const info = seed();
        info.faq = info.faq.map((item) => ({ ...item, section_slug: null }));
        info.faq[0] = { ...info.faq[0], section_slug: 'garanzie' };
        expect(sectionInUse(info, 'garanzie')).toBe(true);
        expect(sectionInUse(info, 'pagamenti')).toBe(false);
    });
});
