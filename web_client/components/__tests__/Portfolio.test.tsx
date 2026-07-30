import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { Portfolio } from '@/components/sections/Portfolio';
import type { PortfolioItem } from '@/lib/portfolio';

function makeProject(overrides: Partial<PortfolioItem> = {}): PortfolioItem {
    return {
        id: 'p1',
        title: 'Progetto',
        category: 'Cucina',
        location: 'Roma',
        image: 'https://images.unsplash.com/photo-1.jpg',
        description: 'Descrizione del progetto',
        stats: { area: '10 mq', duration: '1 mese', budget: '€10k' },
        ...overrides,
    };
}

function mockPortfolioResponse(projects: PortfolioItem[]) {
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => projects,
    });
}

const originalFetch = global.fetch;

afterEach(() => {
    global.fetch = originalFetch;
});

describe('Portfolio', () => {
    it('builds the filter chips from the loaded projects', async () => {
        mockPortfolioResponse([
            makeProject({ id: 'a', category: 'Cucina' }),
            makeProject({ id: 'b', category: 'Bagno' }),
        ]);

        render(<Portfolio />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Cucina' })).toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: 'Bagno' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Tutti' })).toBeInTheDocument();

        // Regression guard: the old hardcoded list offered a category that matched
        // nothing and rendered a blank grid.
        expect(screen.queryByRole('button', { name: 'Esterni' })).not.toBeInTheDocument();
    });

    it('gives every filter chip a 44px touch target', async () => {
        mockPortfolioResponse([makeProject({ id: 'a', category: 'Cucina' })]);

        render(<Portfolio />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Cucina' })).toHaveClass('min-h-[44px]');
        });
    });

    it('shows an empty state when new data no longer has the selected category', async () => {
        // Reachable race: the user picks a category from the fallback data, then the
        // backend response arrives without it. The fetch is held open so the click
        // lands while the fallback categories are still on screen.
        let deliverProjects: (projects: PortfolioItem[]) => void = () => {};
        const pending = new Promise<PortfolioItem[]>((resolve) => {
            deliverProjects = resolve;
        });
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => pending });

        render(<Portfolio />);

        // "Bagno" comes from the fallback data rendered before the fetch resolves.
        fireEvent.click(screen.getByRole('button', { name: 'Bagno' }));

        await act(async () => {
            deliverProjects([makeProject({ id: 'a', category: 'Cucina' })]);
        });

        expect(screen.getAllByText(/Nessun progetto nella categoria/)[0]).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Bagno' })).not.toBeInTheDocument();

        fireEvent.click(screen.getAllByRole('button', { name: 'Mostra tutti' })[0]);

        expect(screen.queryByText(/Nessun progetto nella categoria/)).not.toBeInTheDocument();
    });

    it('caps the rail at the display limit', async () => {
        mockPortfolioResponse(
            Array.from({ length: 12 }, (_, i) =>
                makeProject({ id: `p${i}`, title: `Progetto ${i}`, category: 'Cucina' }),
            ),
        );

        render(<Portfolio />);

        await waitFor(() => {
            expect(screen.getAllByRole('button', { name: /Vai all'elemento/ })).toHaveLength(8);
        });
    });

    it('points the section CTA at the archive page', async () => {
        mockPortfolioResponse([makeProject({ id: 'a' })]);

        render(<Portfolio />);

        const cta = await screen.findByRole('link', { name: 'Visualizza tutti i progetti' });
        expect(cta).toHaveAttribute('href', '/progetti');
    });

    it('renders a placeholder instead of an image when a project has no photo', async () => {
        mockPortfolioResponse([makeProject({ id: 'a', title: 'Senza foto', image: null })]);

        render(<Portfolio />);

        await waitFor(() => {
            expect(screen.queryByAltText('Senza foto')).not.toBeInTheDocument();
        });
    });

    it('shows only Area, not Tempo or Budget, on the project stats', async () => {
        mockPortfolioResponse([makeProject({ id: 'a' })]);

        render(<Portfolio />);

        await waitFor(() => {
            expect(screen.getAllByText('Area').length).toBeGreaterThan(0);
        });
        expect(screen.queryByText('Tempo')).not.toBeInTheDocument();
        expect(screen.queryByText('Budget')).not.toBeInTheDocument();
    });

    it('shows the description by default and lets the user hide it', async () => {
        mockPortfolioResponse([makeProject({ id: 'a', description: 'Descrizione del progetto' })]);

        render(<Portfolio />);

        const card = await screen.findByRole('button', { expanded: true });
        expect(within(card).getByText('Descrizione del progetto')).toBeVisible();
        expect(within(card).getByText('Nascondi descrizione')).toBeInTheDocument();

        fireEvent.click(card);

        expect(screen.getByRole('button', { expanded: false })).toBe(card);
        expect(within(card).getByText('Mostra descrizione')).toBeInTheDocument();
    });
});
