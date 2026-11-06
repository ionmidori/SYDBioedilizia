import { PORTFOLIO_REVALIDATE_SECONDS, defaultProjects, type PortfolioItem } from '@/lib/portfolio';
import { getPortfolio } from '@/lib/portfolio/server';

// jsdom has a `window`, where getPortfolio() refuses to run: pretend to be the server.
jest.mock('@/lib/portfolio/runtime', () => ({ isBrowser: () => false }));

function makeProject(overrides: Partial<PortfolioItem> = {}): PortfolioItem {
    return {
        id: 'p1',
        title: 'Bagno',
        category: 'Bagno',
        location: 'Roma',
        image: null,
        description: '',
        stats: { area: '', duration: '', budget: '' },
        ...overrides,
    };
}

let errorSpy: jest.SpyInstance;
beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe('getPortfolio (server)', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('asks the backend directly, cached for the ISR interval', async () => {
        const projects = [makeProject()];
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => projects });

        await expect(getPortfolio()).resolves.toEqual({ projects, isFallback: false });
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringMatching(/\/api\/content\/portfolio$/),
            expect.objectContaining({ next: { revalidate: PORTFOLIO_REVALIDATE_SECONDS } }),
        );
    });

    it('falls back to the placeholders when the backend is down (outside a production revalidation)', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
        await expect(getPortfolio()).resolves.toEqual({ projects: defaultProjects, isFallback: true });
    });
});
