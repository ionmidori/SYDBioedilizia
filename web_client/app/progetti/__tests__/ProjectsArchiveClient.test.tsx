import { fireEvent, render, screen } from '@testing-library/react';
import { ProjectsArchiveClient } from '../ProjectsArchiveClient';
import type { PortfolioItem } from '@/lib/portfolio';

function makeProject(overrides: Partial<PortfolioItem> = {}): PortfolioItem {
    return {
        id: 'p1',
        title: 'Progetto',
        category: 'Bagno',
        location: 'Roma',
        image: 'https://images.unsplash.com/photo-1.jpg',
        description: 'Descrizione',
        stats: { area: '6 mq', duration: '', budget: '' },
        ...overrides,
    };
}

const originalFetch = global.fetch;
afterEach(() => {
    global.fetch = originalFetch;
});

describe('ProjectsArchiveClient', () => {
    it('renders the server-provided projects, with filters derived from them, without fetching', () => {
        global.fetch = jest.fn();
        const projects = [
            makeProject({ id: 'a', title: 'Bagno vero', category: 'Bagno' }),
            makeProject({ id: 'b', title: 'Cucina vera', category: 'Cucina' }),
        ];

        render(<ProjectsArchiveClient initial={projects} />);

        expect(global.fetch).not.toHaveBeenCalled();
        expect(screen.getByRole('heading', { name: 'Bagno vero' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Cucina' }));

        expect(screen.queryByRole('heading', { name: 'Bagno vero' })).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Cucina vera' })).toBeInTheDocument();
        // Only categories that have projects: no empty chip.
        expect(screen.queryByRole('button', { name: 'Esterni' })).not.toBeInTheDocument();
    });

    it('builds filters from real projects only and shows examples under "Tutti" only', () => {
        render(<ProjectsArchiveClient initial={[makeProject({ id: 'a', title: 'Bagno vero', category: 'Bagno' })]} />);

        // 1 real + 5 labelled examples, with a note explaining what they are.
        expect(screen.getByText('1 progetto · 5 esempi')).toBeInTheDocument();
        expect(screen.getByText(/sono foto di riferimento per lo stile/)).toBeInTheDocument();
        // Chips: only the real project's category (examples have Cucina, Ufficio, ...).
        expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Tutti', 'Bagno']);

        fireEvent.click(screen.getByRole('button', { name: 'Bagno' }));

        expect(screen.getByText('1 progetto')).toBeInTheDocument();
        expect(screen.queryByText(/^Esempio/)).not.toBeInTheDocument();
    });

    it('shows the configured stats as a description list', () => {
        render(<ProjectsArchiveClient initial={[makeProject()]} />);

        expect(screen.getByRole('term')).toHaveTextContent('Area');
        expect(screen.getByRole('definition')).toHaveTextContent('6 mq');
    });
});
