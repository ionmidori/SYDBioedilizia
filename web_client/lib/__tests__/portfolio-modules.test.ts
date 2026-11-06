import {
    defaultProjects,
    parsePortfolio,
    projectImageAlt,
    visibleStats,
    withFallback,
    type PortfolioItem,
} from '@/lib/portfolio';
import { getPortfolio, resetServerPortfolioMemory, resolveServerPortfolio } from '@/lib/portfolio/server';
import { portfolioItemList, serializeJsonLd } from '@/lib/portfolio/structured-data';

function makeProject(overrides: Partial<PortfolioItem> = {}): PortfolioItem {
    return {
        id: 'p1',
        title: 'Bagno in terracotta',
        category: 'Bagno',
        location: 'Roma',
        image: 'https://firebasestorage.googleapis.com/v0/b/b/o/portfolio%2F1.webp?alt=media',
        description: 'Doccia con soffione a pioggia.',
        stats: { area: '6 mq', duration: '', budget: '' },
        ...overrides,
    };
}

let errorSpy: jest.SpyInstance;
beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe('parsePortfolio', () => {
    it('keeps the well-formed projects and drops (and logs) the malformed ones', () => {
        const good = makeProject();
        const parsed = parsePortfolio([good, { id: 'x', title: 42 }, null]);
        expect(parsed).toEqual([good]);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('2 malformed'));
    });

    it('fills stats the backend omitted', () => {
        expect(parsePortfolio([{ ...makeProject(), stats: {} }])?.[0].stats).toEqual({ area: '', duration: '', budget: '' });
    });

    it('returns null for a body that is not a list', () => {
        expect(parsePortfolio({ items: [] })).toBeNull();
    });
});

describe('withFallback', () => {
    it('marks real projects as real', () => {
        const projects = [makeProject()];
        expect(withFallback(projects)).toEqual({ projects, isFallback: false });
    });

    it.each([[null], [[]]])('uses the placeholders for %p', (input) => {
        expect(withFallback(input)).toEqual({ projects: defaultProjects, isFallback: true });
    });
});

describe('presentation', () => {
    it('describes the photo with title, category and place', () => {
        expect(projectImageAlt(makeProject())).toBe('Bagno in terracotta · Bagno, Roma');
        expect(projectImageAlt(makeProject({ location: '' }))).toBe('Bagno in terracotta · Bagno');
    });

    it('shows only the configured stats, in order', () => {
        expect(visibleStats(makeProject().stats)).toEqual([{ key: 'area', label: 'Area', value: '6 mq' }]);
    });
});

describe('structured data', () => {
    it('never describes the placeholder projects', () => {
        expect(portfolioItemList(withFallback(null))).toBeNull();
    });

    it('lists real projects with their photo and place, linked to the business', () => {
        const list = portfolioItemList(withFallback([makeProject(), makeProject({ id: 'p2', image: null })]));
        expect(list).toMatchObject({
            '@type': 'ItemList',
            numberOfItems: 2,
            itemListElement: [
                {
                    position: 1,
                    item: {
                        name: 'Bagno in terracotta',
                        genre: 'Bagno',
                        contentLocation: { '@type': 'Place', name: 'Roma' },
                        image: { '@type': 'ImageObject', caption: 'Bagno in terracotta · Bagno, Roma' },
                        creator: { '@id': expect.stringContaining('/#business') },
                    },
                },
                { position: 2, item: expect.not.objectContaining({ image: expect.anything() }) },
            ],
        });
    });

    it('cannot be closed early by content from the database', () => {
        const json = serializeJsonLd({ description: '</script><script>alert(1)</script>' });
        expect(json).not.toContain('</script>');
        expect(JSON.parse(json).description).toBe('</script><script>alert(1)</script>');
    });
});

describe('getPortfolio in the browser', () => {
    it('refuses to run: it reads a server-only env var', async () => {
        await expect(getPortfolio()).rejects.toThrow('server-only');
    });
});

describe('resolveServerPortfolio', () => {
    beforeEach(() => resetServerPortfolioMemory());

    it('passes real projects through', () => {
        const projects = [makeProject()];
        expect(resolveServerPortfolio(projects)).toEqual({ projects, isFallback: false });
    });

    it('never throws on a failure: placeholders when nothing was ever received', () => {
        expect(resolveServerPortfolio(null)).toEqual({ projects: defaultProjects, isFallback: true });
    });

    it('reuses the last real list when the backend later fails', () => {
        const projects = [makeProject()];
        resolveServerPortfolio(projects);
        expect(resolveServerPortfolio(null)).toEqual({ projects, isFallback: false });
    });

    it('treats a successful empty list as nothing published, and forgets the old list', () => {
        resolveServerPortfolio([makeProject()]);
        expect(resolveServerPortfolio([])).toEqual({ projects: defaultProjects, isFallback: true });
        expect(resolveServerPortfolio(null).isFallback).toBe(true);
    });
});
