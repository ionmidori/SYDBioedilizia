import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
    it('has no category filters — those live on the /progetti archive', async () => {
        mockPortfolioResponse([
            makeProject({ id: 'a', category: 'Cucina' }),
            makeProject({ id: 'b', category: 'Bagno' }),
        ]);

        render(<Portfolio />);

        await screen.findAllByText('Area');
        expect(screen.queryByRole('group', { name: 'Filtra per categoria' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Tutti' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Cucina' })).not.toBeInTheDocument();
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

    describe('desktop row controls', () => {
        const originalScrollBy = HTMLElement.prototype.scrollBy;

        afterEach(() => {
            HTMLElement.prototype.scrollBy = originalScrollBy;
        });

        it('enables the arrows from the row overflow and pages by its visible width', async () => {
            const scrollBy = jest.fn();
            HTMLElement.prototype.scrollBy = scrollBy;
            mockPortfolioResponse([makeProject({ id: 'a' }), makeProject({ id: 'b' })]);

            render(<Portfolio />);

            const next = await screen.findByRole('button', { name: 'Progetti successivi' });
            const prev = screen.getByRole('button', { name: 'Progetti precedenti' });
            // jsdom has no layout: nothing overflows, so both arrows start disabled.
            expect(next).toBeDisabled();
            expect(prev).toBeDisabled();

            // Give the row (the scroll container) a real overflow, then let it re-measure.
            const row = document.querySelector('[data-portfolio-row]') as HTMLElement;
            Object.defineProperty(row, 'clientWidth', { configurable: true, value: 1000 });
            Object.defineProperty(row, 'scrollWidth', { configurable: true, value: 2500 });
            fireEvent.scroll(row);

            expect(next).toBeEnabled();
            expect(prev).toBeDisabled();

            fireEvent.click(next);
            expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 1000 }));
        });
    });
});
