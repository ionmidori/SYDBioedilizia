import { renderHook, waitFor } from '@testing-library/react';
import type { PortfolioItem } from '@/lib/portfolio';
import { usePortfolioProjects } from '@/lib/portfolio/use-portfolio-projects';

const real: PortfolioItem = {
    id: 'r1',
    title: 'Bagno',
    category: 'Bagno',
    location: 'Roma',
    image: null,
    description: '',
    stats: { area: '', duration: '', budget: '' },
};

const originalFetch = global.fetch;
afterEach(() => {
    global.fetch = originalFetch;
});

function resolveWith(projects: PortfolioItem[]) {
    let resolve!: () => void;
    global.fetch = jest.fn(
        () =>
            new Promise((r) => {
                resolve = () => r({ ok: true, json: async () => projects } as Response);
            }),
    ) as jest.Mock;
    return () => resolve();
}

describe('usePortfolioProjects', () => {
    it('keeps real server data and does not fetch', () => {
        global.fetch = jest.fn();
        const { result } = renderHook(() => usePortfolioProjects([real]));
        expect(result.current).toEqual([real]);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('starts empty without server data, then shows what the browser fetch returns', async () => {
        const release = resolveWith([real]);
        const { result } = renderHook(() => usePortfolioProjects());
        expect(result.current).toEqual([]);
        release();
        await waitFor(() => expect(result.current).toEqual([real]));
    });

    it('ignores a response that arrives after unmount', async () => {
        const release = resolveWith([real]);
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const { unmount } = renderHook(() => usePortfolioProjects([]));
        unmount();
        release();
        await new Promise((r) => setTimeout(r, 0));
        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});
