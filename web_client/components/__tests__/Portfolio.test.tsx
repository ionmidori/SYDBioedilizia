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

        await screen.findAllByText('Descrizione del progetto');
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

    it('shows no project info on the cards, only the description', async () => {
        mockPortfolioResponse([makeProject({ id: 'a', title: 'Bagno vero', category: 'Cucina', location: 'Roma' })]);

        render(<Portfolio />);

        await screen.findAllByText('Descrizione del progetto');
        // No title, category, place or stats rendered as visible text on the cards.
        expect(screen.queryByRole('heading')).not.toBeInTheDocument();
        expect(screen.queryByText('Cucina')).not.toBeInTheDocument();
        expect(screen.queryByText('Roma')).not.toBeInTheDocument();
        expect(screen.queryByText('Area')).not.toBeInTheDocument();
        expect(screen.queryByText('Tempo')).not.toBeInTheDocument();
        expect(screen.queryByText('Budget')).not.toBeInTheDocument();
    });

    it('keeps the description collapsed by default and opens it with a click', async () => {
        mockPortfolioResponse([makeProject({ id: 'a', description: 'Descrizione del progetto' })]);

        render(<Portfolio />);

        // The real project's card (the examples after it are cards too).
        const card = (await screen.findAllByText('Descrizione del progetto', { selector: 'span' }))[0]!.closest('button')!;
        expect(card).toHaveAttribute('aria-expanded', 'false');
        expect(within(card).getByText('Descrizione')).toBeInTheDocument();

        fireEvent.click(card);

        expect(card).toHaveAttribute('aria-expanded', 'true');
        expect(within(card).getByText('Chiudi')).toBeInTheDocument();

        fireEvent.click(card);

        expect(card).toHaveAttribute('aria-expanded', 'false');
    });

    it('closes the open description when pressing the Escape key', async () => {
        mockPortfolioResponse([makeProject({ id: 'a', description: 'Descrizione del progetto' })]);

        render(<Portfolio />);

        const card = (await screen.findAllByText('Descrizione del progetto', { selector: 'span' }))[0]!.closest('button')!;
        fireEvent.click(card);
        expect(card).toHaveAttribute('aria-expanded', 'true');

        fireEvent.keyDown(card, { key: 'Escape' });
        expect(card).toHaveAttribute('aria-expanded', 'false');
    });

    it('never dims a card or its photo with an opacity or a scrim', async () => {
        mockPortfolioResponse([makeProject({ id: 'a' })]);

        const { container } = render(<Portfolio />);
        await screen.findAllByText('Descrizione del progetto');

        const cards = container.querySelectorAll('button[aria-expanded]');
        expect(cards.length).toBeGreaterThan(0);
        cards.forEach((card) => {
            // Class tokens only (not the markup): an opacity utility or a gradient layer.
            [card, ...Array.from(card.querySelectorAll('*'))].forEach((node) => {
                const tokens = (node.getAttribute('class') ?? '').split(/\s+/);
                expect(tokens.filter((t) => /(^|:)(opacity-|bg-gradient-|bg-linear-)/.test(t))).toEqual([]);
            });
        });
    });

    it('gives each card an explicit name and describes it only while open', async () => {
        mockPortfolioResponse([makeProject({ id: 'a', title: 'Bagno vero', location: 'Roma' })]);

        render(<Portfolio />);

        const card = (await screen.findAllByRole('button', { name: 'Bagno vero, Roma. Mostra la descrizione.' }))[0]!;
        expect(card).not.toHaveAttribute('aria-describedby');

        fireEvent.click(card);

        expect(card).toHaveAccessibleName('Bagno vero, Roma. Nascondi la descrizione.');
        const descriptionId = card.getAttribute('aria-describedby')!;
        expect(document.getElementById(descriptionId)).toHaveTextContent('Descrizione del progetto');
    });

    it('does not use cinematic-focus on cards: its focus scale is cropped by the desktop row', async () => {
        mockPortfolioResponse([makeProject({ id: 'a' })]);

        const { container } = render(<Portfolio />);
        await screen.findAllByText('Descrizione del progetto');

        container.querySelectorAll('button[aria-expanded]').forEach((card) => {
            expect(card).not.toHaveClass('cinematic-focus');
        });
    });

    it('uses the server-rendered projects without fetching again', async () => {
        global.fetch = jest.fn();
        const projects = [makeProject({ id: 'a', title: 'Bagno vero' })];

        render(<Portfolio initial={projects} />);

        expect(screen.getAllByText(/Bagno vero/).length).toBeGreaterThan(0);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('retries in the browser when the server had no real project', async () => {
        mockPortfolioResponse([makeProject({ id: 'a', title: 'Arrivato dopo' })]);

        render(<Portfolio initial={[]} />);

        expect((await screen.findAllByText(/Arrivato dopo/)).length).toBeGreaterThan(0);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('describes each photo with title, category and place', async () => {
        mockPortfolioResponse([makeProject({ id: 'a', title: 'Bagno', category: 'Bagno', location: 'Roma' })]);

        render(<Portfolio />);

        expect((await screen.findAllByAltText('Bagno · Bagno, Roma')).length).toBeGreaterThan(0);
    });

    it('fills the rail with labelled examples after the real projects', async () => {
        mockPortfolioResponse([makeProject({ id: 'a', title: 'Bagno vero', category: 'Bagno' })]);

        render(<Portfolio />);

        // Before the response the rail already shows 6 examples: wait for the real one.
        await screen.findAllByText(/Bagno vero/);
        // 1 real + 5 examples = PORTFOLIO_MIN_CARDS cards in the mobile rail.
        expect(screen.getAllByRole('button', { name: /Vai all'elemento/ })).toHaveLength(6);
        expect(screen.getAllByText(/^Esempio/).length).toBeGreaterThan(0);
        // The real project carries no "Esempio" label.
        const realCard = screen.getAllByRole('button', { name: /^Bagno vero, Roma\./ })[0]!;
        expect(within(realCard).queryByText(/^Esempio/)).not.toBeInTheDocument();
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
