import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectCard } from '../ProjectCard';
import { quotesApi } from '@/lib/quotes-api';
import type { ProjectListItem } from '@/types/projects';

jest.mock('@/lib/quotes-api', () => ({
    quotesApi: { submitQuote: jest.fn() },
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

// Dialog on desktop / Vaul drawer on mobile: the switch is not under test here.
jest.mock('@/components/ui/responsive-drawer', () => ({
    ResponsiveDrawer: ({ open, title, children }: { open?: boolean; title?: string; children: React.ReactNode }) =>
        open ? (
            <div role="dialog" aria-label={title}>
                {children}
            </div>
        ) : null,
}));

const submitQuote = quotesApi.submitQuote as jest.Mock;

const PROJECT: ProjectListItem = {
    session_id: 'proj-1',
    title: 'Casa Rossi',
    status: 'quoted',
    updated_at: '2026-10-27T10:00:00Z',
    message_count: 4,
    has_quote: true,
    quote_status: 'draft',
};

function renderCard(project: Partial<ProjectListItem> = {}) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <ProjectCard project={{ ...PROJECT, ...project }} hasQuote={project.has_quote ?? true} />
        </QueryClientProvider>
    );
}

beforeEach(() => {
    submitQuote.mockReset();
    push.mockReset();
});

describe('ProjectCard — "Invia al team"', () => {
    it('shows the button only for a draft quote with items', () => {
        renderCard();
        expect(screen.getByRole('button', { name: 'Invia al team' })).toBeInTheDocument();
    });

    it.each([
        [{ quote_status: 'pending_review' }],
        [{ has_quote: false, quote_status: undefined }],
        [{ quote_status: 'rejected' }],
    ])('hides it otherwise (%o)', (overrides) => {
        renderCard(overrides);
        expect(screen.queryByRole('button', { name: 'Invia al team' })).not.toBeInTheDocument();
    });

    it('says the quote is with the team once submitted', () => {
        renderCard({ quote_status: 'in_review' });
        expect(screen.getByTestId('quote-with-team')).toHaveTextContent('Preventivo inviato al team');
    });

    it('asks for confirmation before sending, and does not open the project', async () => {
        submitQuote.mockResolvedValue({ project_id: 'proj-1', status: 'pending_review', duplicate: false });
        renderCard();

        fireEvent.click(screen.getByRole('button', { name: 'Invia al team' }));
        const dialog = screen.getByRole('dialog', { name: 'Invia al team' });
        expect(submitQuote).not.toHaveBeenCalled();
        expect(push).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Invia al team' }));
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Richiesta inviata'));
        expect(submitQuote).toHaveBeenCalledTimes(1);
        expect(submitQuote.mock.calls[0][0]).toBe('proj-1');
    });

    it('reuses the same Idempotency-Key when retrying after an error', async () => {
        submitQuote
            .mockRejectedValueOnce({ error_code: 'NETWORK' })
            .mockResolvedValueOnce({ project_id: 'proj-1', status: 'pending_review', duplicate: true });
        renderCard();
        fireEvent.click(screen.getByRole('button', { name: 'Invia al team' }));
        const send = () =>
            fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Invia al team' }));

        send();
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invio non riuscito'));
        send();
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('è con il nostro team'));
        expect(submitQuote.mock.calls[0][1]).toBe(submitQuote.mock.calls[1][1]);
    });

    it('explains a refused submission in Italian', async () => {
        submitQuote.mockRejectedValue({ error_code: 'QUOTE_EMPTY', message: 'The quote has no items yet' });
        renderCard();
        fireEvent.click(screen.getByRole('button', { name: 'Invia al team' }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Invia al team' }));
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('non ha ancora lavorazioni'));
    });
});
