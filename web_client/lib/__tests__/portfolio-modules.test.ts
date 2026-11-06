import {
    EXAMPLE_LABEL,
    PORTFOLIO_MIN_CARDS,
    cardAccessibleName,
    cardBadge,
    cardShowsStats,
    cardSubtitle,
    exampleProjects,
    parsePortfolio,
    projectImageAlt,
    visibleStats,
    withExamples,
    type PortfolioItem,
} from '@/lib/portfolio';
import { getPortfolio, resetServerPortfolioMemory, resolveServerPortfolio } from '@/lib/portfolio/server';
import { portfolioItemList, portfolioShareImage, serializeJsonLd } from '@/lib/portfolio/structured-data';
import { DEFAULT_SHARE_IMAGE, shareMetadata } from '@/lib/site-share';

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

describe('withExamples', () => {
    it('fills the gallery up to the minimum, real projects first', () => {
        const cards = withExamples([makeProject({ id: 'r1' })]);
        expect(cards).toHaveLength(PORTFOLIO_MIN_CARDS);
        expect(cards[0]).toMatchObject({ id: 'r1', isExample: false });
        expect(cards.slice(1).every((c) => c.isExample)).toBe(true);
    });

    it('shows only examples when nothing is published yet', () => {
        expect(withExamples([]).map((c) => c.id)).toEqual(
            exampleProjects.slice(0, PORTFOLIO_MIN_CARDS).map((p) => p.id),
        );
    });

    it('adds no example once there are enough real projects', () => {
        const real = Array.from({ length: PORTFOLIO_MIN_CARDS + 2 }, (_, i) => makeProject({ id: `r${i}` }));
        const cards = withExamples(real);
        expect(cards).toHaveLength(real.length);
        expect(cards.some((c) => c.isExample)).toBe(false);
    });

    it('can be turned off with a minimum of 0', () => {
        expect(withExamples([], 0)).toEqual([]);
    });

    it('never gives examples invented places or measures', () => {
        for (const example of exampleProjects) {
            expect(example.location).toBe('');
            expect(example.stats).toEqual({ area: '', duration: '', budget: '' });
        }
        expect(EXAMPLE_LABEL).toBe('Esempio');
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
    it('never describes the examples, even if cards are passed by mistake', () => {
        expect(portfolioItemList([])).toBeNull();
        // Cards are refused at compile time; the runtime filter still drops examples.
        expect(portfolioItemList(withExamples([]) as never)).toBeNull();
        expect(portfolioItemList(withExamples([makeProject()]) as never)).toMatchObject({ numberOfItems: 1 });
    });

    it('lists real projects with their photo and place, linked to the business', () => {
        const list = portfolioItemList([makeProject(), makeProject({ id: 'p2', image: null })]);
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
        expect(resolveServerPortfolio(projects)).toEqual(projects);
    });

    it('never throws on a failure: no project when nothing was ever received', () => {
        expect(resolveServerPortfolio(null)).toEqual([]);
    });

    it('reuses the last real list when the backend later fails', () => {
        const projects = [makeProject()];
        resolveServerPortfolio(projects);
        expect(resolveServerPortfolio(null)).toEqual(projects);
    });

    it('treats a successful empty list as nothing published, and forgets the old list', () => {
        resolveServerPortfolio([makeProject()]);
        expect(resolveServerPortfolio([])).toEqual([]);
        expect(resolveServerPortfolio(null)).toEqual([]);
    });
});

describe('card helpers', () => {
    const [real, example] = withExamples([makeProject()], 2);

    it('labels examples everywhere a card describes itself', () => {
        expect(cardBadge(example)).toBe(`${EXAMPLE_LABEL} · ${example.category}`);
        expect(cardSubtitle(example)).toBe(cardBadge(example));
        expect(cardAccessibleName(example)).toBe(`${EXAMPLE_LABEL}: ${example.title}`);
        expect(projectImageAlt(example)).toMatch(/^Esempio: /);
        expect(cardShowsStats(example)).toBe(false);
    });

    it('shows a real project as it is', () => {
        expect(cardBadge(real)).toBe('Bagno');
        expect(cardSubtitle(real)).toBe('Roma');
        expect(cardAccessibleName(real)).toBe('Bagno in terracotta, Roma');
        expect(cardShowsStats(real)).toBe(true);
    });

    it('leaves no dangling comma when a real project has no place', () => {
        const [noPlace] = withExamples([makeProject({ location: '' })], 0);
        expect(cardAccessibleName(noPlace)).toBe('Bagno in terracotta');
    });
});

describe('link preview', () => {
    it('defaults to the brand logo, never a stock photo', () => {
        expect(DEFAULT_SHARE_IMAGE).toEqual({ url: '/brand/og-default.png', alt: 'SYD Bioedilizia', width: 1200, height: 630 });
        expect(shareMetadata().openGraph?.images).toEqual([DEFAULT_SHARE_IMAGE]);
    });

    it('uses the photo of the first real project that has one', () => {
        const projects = [makeProject({ id: 'a', image: null }), makeProject({ id: 'b' })];
        expect(portfolioShareImage(projects)).toEqual({
            url: projects[1].image,
            alt: 'Bagno in terracotta · Bagno, Roma',
        });
        expect(portfolioShareImage([])).toBeNull();
    });

    it('carries a page title, description and URL into both OpenGraph and Twitter', () => {
        const meta = shareMetadata(undefined, { title: 'FAQ', description: 'Domande', path: '/faq' });
        expect(meta.openGraph).toMatchObject({
            title: 'FAQ',
            description: 'Domande',
            url: 'https://sydbioedilizia.vercel.app/faq',
            images: [DEFAULT_SHARE_IMAGE],
        });
        expect(meta.twitter).toMatchObject({ title: 'FAQ', description: 'Domande', images: [DEFAULT_SHARE_IMAGE.url] });
    });
});
