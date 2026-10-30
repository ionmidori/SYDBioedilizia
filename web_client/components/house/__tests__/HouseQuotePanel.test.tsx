import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HouseQuotePanel } from '../HouseQuotePanel';
import { quotesApi } from '@/lib/quotes-api';

jest.mock('@/lib/quotes-api', () => ({
    quotesApi: { getQuote: jest.fn(), submitQuote: jest.fn(), listUserQuotes: jest.fn(), getQuotePdfUrl: jest.fn() },
}));
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1' }, isAnonymous: false }) }));
const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
// Dialog on desktop / Vaul drawer on mobile: the switch is not under test here.
jest.mock('@/components/ui/responsive-drawer', () => ({
    ResponsiveDrawer: ({ open, title, children }: { open?: boolean; title?: string; children: React.ReactNode }) =>
        open ? <div role="dialog" aria-label={title}>{children}</div> : null,
}));

const getQuote = quotesApi.getQuote as jest.Mock;
const submitQuote = quotesApi.submitQuote as jest.Mock;
const listUserQuotes = quotesApi.listUserQuotes as jest.Mock;

const item = (description: string, room_id: string) => ({
    sku: 'X', description, unit: 'mq', qty: 6, unit_price: 0, total: 0, room_id,
});
const DRAFT = {
    project_id: 'chat-1', user_id: 'u1', status: 'draft', quote_number: 'PRV-2026-0007',
    items: [item('Rimozione piastrelle', 'bagno'), item('Posa gres', 'bagno'), item('Tinteggiatura', 'cucina')],
    rooms: [
        { room_id: 'bagno', room_label: 'Bagno', room_type: 'bagno', room_subtotal: 0 },
        { room_id: 'cucina', room_label: 'Cucina', room_type: 'cucina', room_subtotal: 0 },
    ],
};

function renderPanel() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <HouseQuotePanel chatId="chat-1" />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    listUserQuotes.mockResolvedValue([]);
});

describe('HouseQuotePanel — the quote of the house', () => {
    it('without a quote, sends the user to the chat to ask for one', async () => {
        getQuote.mockResolvedValue(null);
        renderPanel();

        fireEvent.click(await screen.findByRole('button', { name: 'Chiedilo in chat' }));

        expect(replace).toHaveBeenCalledWith('/dashboard?view=chat', { scroll: false });
        expect(screen.queryByRole('button', { name: 'Invia al team' })).not.toBeInTheDocument();
    });

    it('shows a draft by room, without prices, with "Invia al team"', async () => {
        getQuote.mockResolvedValue(DRAFT);
        renderPanel();

        const bagno = await screen.findByRole('region', { name: 'Bagno' });
        expect(within(bagno).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
            expect.stringContaining('Rimozione piastrelle'), expect.stringContaining('Posa gres'),
        ]);
        expect(screen.getByRole('region', { name: 'Cucina' })).toHaveTextContent('Tinteggiatura');
        expect(screen.queryByText(/€/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Invia al team' })).toBeInTheDocument();
        expect(screen.getByText(/scrivi in chat/)).toBeInTheDocument();
    });

    it('offers no "Invia al team" for a draft with no work yet', async () => {
        getQuote.mockResolvedValue({ ...DRAFT, items: [], rooms: [] });
        renderPanel();

        expect(await screen.findByText(/in preparazione/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Invia al team' })).not.toBeInTheDocument();
    });

    it.each(['pending_review', 'in_review'])('says a %s quote is with the team, with nothing to press', async (status) => {
        getQuote.mockResolvedValue({ ...DRAFT, status });
        renderPanel();

        expect(await screen.findByTestId('quote-with-team')).toHaveTextContent('Inviato al team, in revisione');
        expect(screen.queryByRole('button', { name: 'Invia al team' })).not.toBeInTheDocument();
    });

    it('shows an approved quote with its total and PDF', async () => {
        getQuote.mockResolvedValue({ ...DRAFT, status: 'approved' });
        listUserQuotes.mockResolvedValue([{
            project_id: 'chat-1', project_name: 'Nuovo Progetto', quote_number: 'PRV-2026-0007', status: 'approved',
            grand_total: 12200, item_count: 3, updated_at: '2026-10-30T10:00:00Z', pdf_available: true,
        }]);
        renderPanel();

        expect(await screen.findByTestId('quote-download-pdf')).toBeInTheDocument();
        expect(screen.getByTestId('quote-card')).toHaveTextContent('PRV-2026-0007');
        expect(screen.getByTestId('quote-card')).not.toHaveTextContent('Nuovo Progetto');
    });

    it('sends the draft to the team after a confirmation', async () => {
        getQuote.mockResolvedValue(DRAFT);
        submitQuote.mockResolvedValue({ project_id: 'chat-1', status: 'pending_review', duplicate: false });
        renderPanel();

        fireEvent.click(await screen.findByRole('button', { name: 'Invia al team' }));
        const dialog = screen.getByRole('dialog', { name: 'Invia al team' });
        expect(submitQuote).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Invia al team' }));

        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Richiesta inviata'));
        expect(submitQuote.mock.calls[0][0]).toBe('chat-1');
    });

    it('keeps the confirmation on screen while the quote, read again, is now with the team', async () => {
        getQuote.mockResolvedValueOnce(DRAFT).mockResolvedValue({ ...DRAFT, status: 'pending_review' });
        submitQuote.mockResolvedValue({ project_id: 'chat-1', status: 'pending_review', duplicate: false });
        renderPanel();

        fireEvent.click(await screen.findByRole('button', { name: 'Invia al team' }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Invia al team' }));

        expect(await screen.findByTestId('quote-with-team')).toBeInTheDocument();
        expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent('Richiesta inviata');
    });

    it('reuses the same Idempotency-Key when retrying after an error', async () => {
        getQuote.mockResolvedValue(DRAFT);
        submitQuote
            .mockRejectedValueOnce({ error_code: 'NETWORK' })
            .mockResolvedValueOnce({ project_id: 'chat-1', status: 'pending_review', duplicate: true });
        renderPanel();
        fireEvent.click(await screen.findByRole('button', { name: 'Invia al team' }));
        const send = () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Invia al team' }));

        send();
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invio non riuscito'));
        send();
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('è con il nostro team'));
        expect(submitQuote.mock.calls[0][1]).toBe(submitQuote.mock.calls[1][1]);
    });

    it('explains a refused submission in Italian', async () => {
        getQuote.mockResolvedValue(DRAFT);
        submitQuote.mockRejectedValue({ error_code: 'QUOTE_EMPTY', message: 'The quote has no items yet' });
        renderPanel();
        fireEvent.click(await screen.findByRole('button', { name: 'Invia al team' }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Invia al team' }));

        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('non ha ancora lavorazioni'));
    });
});
