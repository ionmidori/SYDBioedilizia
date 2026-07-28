import {
    ALL_CATEGORIES,
    defaultProjects,
    deriveCategories,
    fetchPortfolio,
    filterByCategory,
    type PortfolioItem,
} from '@/lib/portfolio';

function makeProject(overrides: Partial<PortfolioItem> = {}): PortfolioItem {
    return {
        id: 'p1',
        title: 'Progetto',
        category: 'Cucina',
        location: 'Roma',
        image: 'https://example.com/a.jpg',
        description: 'Descrizione',
        stats: { area: '10 mq', duration: '1 mese', budget: '€10k' },
        ...overrides,
    };
}

describe('deriveCategories', () => {
    it('always leads with the "all" pseudo-category', () => {
        expect(deriveCategories([])).toEqual([ALL_CATEGORIES]);
    });

    it('never invents a category that has no projects', () => {
        // This is the regression guard: the old hardcoded list contained "Esterni",
        // which matched nothing and rendered an empty grid.
        const projects = [
            makeProject({ id: 'a', category: 'Cucina' }),
            makeProject({ id: 'b', category: 'Bagno' }),
        ];

        const categories = deriveCategories(projects);

        expect(categories).toEqual([ALL_CATEGORIES, 'Cucina', 'Bagno']);
        for (const category of categories.slice(1)) {
            expect(filterByCategory(projects, category).length).toBeGreaterThan(0);
        }
    });

    it('never leaves a project unreachable by any filter', () => {
        const projects = [
            makeProject({ id: 'a', category: 'Intero Appartamento' }),
            makeProject({ id: 'b', category: 'Camera da letto' }),
            makeProject({ id: 'c', category: 'Ufficio' }),
        ];

        const categories = deriveCategories(projects);

        for (const project of projects) {
            expect(categories).toContain(project.category);
        }
    });

    it('deduplicates and preserves first-appearance order', () => {
        const projects = [
            makeProject({ id: 'a', category: 'Bagno' }),
            makeProject({ id: 'b', category: 'Cucina' }),
            makeProject({ id: 'c', category: 'Bagno' }),
        ];

        expect(deriveCategories(projects)).toEqual([ALL_CATEGORIES, 'Bagno', 'Cucina']);
    });

    it('drops blank and whitespace-only categories', () => {
        const projects = [
            makeProject({ id: 'a', category: '' }),
            makeProject({ id: 'b', category: '   ' }),
            makeProject({ id: 'c', category: 'Cucina' }),
        ];

        expect(deriveCategories(projects)).toEqual([ALL_CATEGORIES, 'Cucina']);
    });
});

describe('filterByCategory', () => {
    const projects = [
        makeProject({ id: 'a', category: 'Cucina' }),
        makeProject({ id: 'b', category: 'Bagno' }),
    ];

    it('returns everything for the "all" category', () => {
        expect(filterByCategory(projects, ALL_CATEGORIES)).toHaveLength(2);
    });

    it('returns only matching projects', () => {
        expect(filterByCategory(projects, 'Bagno')).toEqual([projects[1]]);
    });

    it('returns an empty array for an unknown category', () => {
        expect(filterByCategory(projects, 'Esterni')).toEqual([]);
    });
});

describe('fetchPortfolio', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('returns backend projects when the call succeeds', async () => {
        const backendProjects = [makeProject({ id: 'from-backend' })];
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => backendProjects,
        });

        await expect(fetchPortfolio()).resolves.toEqual(backendProjects);
    });

    it('falls back to defaults when the backend returns an empty list', async () => {
        // The empty case is real: it is what a missing Firestore composite index
        // looks like from the client, since the route swallows the error.
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => [],
        });

        await expect(fetchPortfolio()).resolves.toEqual(defaultProjects);
    });

    it('falls back to defaults on a non-ok response', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false });

        await expect(fetchPortfolio()).resolves.toEqual(defaultProjects);
    });

    it('falls back to defaults when the network throws', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

        await expect(fetchPortfolio()).resolves.toEqual(defaultProjects);
    });
});
