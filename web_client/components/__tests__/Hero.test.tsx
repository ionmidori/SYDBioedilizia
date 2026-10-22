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
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Casa dei Sogni/);
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
});
