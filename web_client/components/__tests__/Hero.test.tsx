import { render, screen, within } from '@testing-library/react';
import { Hero } from '@/components/sections/Hero';

const originalFetch = global.fetch;

beforeEach(() => {
    // Portfolio loads its projects on mount; an empty list keeps the fallback data.
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
});

afterEach(() => {
    global.fetch = originalFetch;
});

describe('Hero', () => {
    it('shows the portfolio gallery in place of the intro video', async () => {
        const { container } = render(<Hero />);

        expect(container.querySelector('video')).toBeNull();

        const gallery = screen.getByRole('region', { name: 'I nostri capolavori' });
        expect(gallery).toHaveAttribute('id', 'portfolio');
        expect(
            await within(gallery).findByRole('link', { name: 'Visualizza tutti i progetti' }),
        ).toHaveAttribute('href', '/progetti');
    });

    it('drops the gallery title and subtitle — the hero h1 is the only heading above it', () => {
        render(<Hero />);

        expect(screen.queryByRole('heading', { name: /capolavori/i })).not.toBeInTheDocument();
        expect(screen.queryByText(/Esplora una selezione/)).not.toBeInTheDocument();
        const heading = screen.getByRole('heading', { level: 1 });
        expect(heading).toHaveTextContent(/Casa dei Sogni/);
        expect(heading).toHaveTextContent(/SYD Bioedilizia/);
        expect(heading.querySelector('svg[data-variant="horizontal"]')).toBeInTheDocument();
    });

    it('is not a scroll container, so the #portfolio anchor cannot hide the title', () => {
        // Production bug: "Progetti" (#portfolio, which lives inside the hero) made the
        // browser scroll the overflow-hidden hero itself by 500px (its decorative glows
        // overflow it) — the h1 vanished and could not be scrolled back. overflow: clip
        // clips the same way but is never programmatically scrollable.
        render(<Hero />);

        const hero = screen.getByRole('heading', { level: 1 }).closest('section');
        expect(hero).toHaveClass('overflow-clip');
        expect(hero).not.toHaveClass('overflow-hidden');
    });

    it('gives the key figures as a description list, not as headings that break the outline', () => {
        render(<Hero />);

        expect(screen.queryAllByRole('heading', { level: 4 })).toHaveLength(0);
        const terms = screen.getAllByRole('term').map((t) => t.textContent);
        expect(terms).toEqual(['Progetti Completati', 'Tempo Preventivo', 'Soddisfazione Clienti']);
        for (const term of screen.getAllByRole('term')) {
            expect(term.nextElementSibling?.tagName).toBe('DD');
        }
    });

    it('keeps the outline flat: the project cards show no title, so no heading sits under the h1', async () => {
        render(<Hero />);

        // Wait for the gallery (its CTA) so the cards are rendered before asserting.
        await screen.findByRole('link', { name: 'Visualizza tutti i progetti' });
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
        expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    });
});
