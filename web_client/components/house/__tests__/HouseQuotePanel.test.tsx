import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HouseQuotePanel } from '../HouseQuotePanel';
import { quotesApi } from '@/lib/quotes-api';

jest.mock('@/lib/quotes-api', () => ({
    quotesApi: {
        getQuote: jest.fn(), getQuoteHistory: jest.fn(), submitQuote: jest.fn(), listUserQuotes: jest.fn(),
        getQuotePdfUrl: jest.fn(),
    },
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
const getQuoteHistory = quotesApi.getQuoteHistory as jest.Mock;
const getQuotePdfUrl = quotesApi.getQuotePdfUrl as jest.Mock;

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
    getQuoteHistory.mockResolvedValue({ in_progress: null, sent: [] });
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

    it('says how precise the estimate of a draft is, never an amount', async () => {
        getQuote.mockResolvedValue({ ...DRAFT, estimate: { precision: 85 } });
        renderPanel();

        expect(await screen.findByTestId('quote-precision')).toHaveTextContent('Stima precisa al 85 %');
        expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    });

    it.each([
        ['no estimate', undefined],
        ['an estimate without precision', { precision: null }],
    ])('says nothing of the precision with %s', async (_label, estimate) => {
        getQuote.mockResolvedValue({ ...DRAFT, estimate });
        renderPanel();

        await screen.findByRole('region', { name: 'Bagno' });
        expect(screen.queryByTestId('quote-precision')).not.toBeInTheDocument();
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


describe('HouseQuotePanel — a quote the client received, and its next revision', () => {
    // GET /quote/{id} serves the copy the client received while the next revision is prepared.
    // `version` of the copy received = the revision shown by the card.
    const RECEIVED = { ...DRAFT, status: 'sent', version: 3, sent_at: '2026-10-12T09:00:00Z' };
    const LISTED = {
        project_id: 'chat-1', project_name: '', quote_number: 'PRV-2026-0007', status: 'sent',
        grand_total: 2440, item_count: 3, updated_at: '2026-10-12T09:00:00Z', pdf_available: true,
    };
    const SENT = [
        { revision: 3, sent_at: '2026-10-12T09:00:00Z', grand_total: 2440, pdf_available: true },
        { revision: 2, sent_at: '2026-10-05T09:00:00Z', grand_total: 1464, pdf_available: true },
    ];
    const progress = (state: string) => ({
        state,
        items: [item('Porta nuova', 'bagno'), item('Termoarredo', 'bagno')],
        rooms: [{ room_id: 'bagno', room_label: 'Bagno', room_type: 'bagno', room_subtotal: 0 }],
    });

    beforeEach(() => {
        getQuote.mockResolvedValue(RECEIVED);
        listUserQuotes.mockResolvedValue([LISTED]);
    });

    it('keeps the quote received in front and shows the new revision without prices, to send to the team', async () => {
        getQuoteHistory.mockResolvedValue({ in_progress: progress('draft'), sent: SENT });
        renderPanel();

        const revision = await screen.findByRole('region', { name: 'Nuova revisione' });
        expect(revision).toHaveTextContent('Porta nuova');
        expect(revision).toHaveTextContent('Termoarredo');
        expect(revision).not.toHaveTextContent('€');
        expect(within(revision).getByRole('button', { name: 'Invia al team' })).toBeInTheDocument();
        expect(screen.getByTestId('quote-card')).toHaveAttribute('data-quote-status', 'sent');
        expect(screen.getByText(/resta valido/)).toBeInTheDocument();
    });

    it('says when the new revision is with the team, with nothing to press', async () => {
        // The backend sends no lines once the team has the revision (it may be editing them).
        getQuoteHistory.mockResolvedValue({ in_progress: { state: 'with_team', items: [], rooms: [] }, sent: SENT });
        renderPanel();

        const revision = await screen.findByRole('region', { name: 'Nuova revisione' });
        expect(revision).toHaveTextContent('Inviata al team, in revisione');
        expect(within(revision).queryByRole('region')).not.toBeInTheDocument(); // no empty section
        expect(screen.queryByRole('button', { name: 'Invia al team' })).not.toBeInTheDocument();
    });

    it('says when the team declined the new revision', async () => {
        getQuoteHistory.mockResolvedValue({ in_progress: { state: 'rejected', items: [], rooms: [] }, sent: SENT });
        renderPanel();

        const revision = await screen.findByRole('region', { name: 'Nuova revisione' });
        expect(revision).toHaveTextContent(/non ha accolto/);
        expect(screen.queryByRole('button', { name: 'Invia al team' })).not.toBeInTheDocument();
    });

    it('lists the older revisions received, with their PDF', async () => {
        getQuoteHistory.mockResolvedValue({ in_progress: null, sent: SENT });
        getQuotePdfUrl.mockResolvedValue({ pdf_url: 'https://signed/r2.pdf' });
        const open = jest.spyOn(window, 'open').mockImplementation(() => null);
        renderPanel();

        const older = await screen.findByRole('region', { name: 'Revisioni precedenti' });
        const rows = within(older).getAllByRole('listitem');
        expect(rows).toHaveLength(1); // rev. 3 is the card above
        expect(rows[0]).toHaveTextContent('Rev. 2');
        expect(rows[0]).toHaveTextContent('05 ott 2026');
        fireEvent.click(within(rows[0]).getByRole('button', { name: 'Scarica il PDF della revisione 2' }));

        await waitFor(() => expect(getQuotePdfUrl).toHaveBeenCalledWith('chat-1', 2));
        expect(open).toHaveBeenCalledWith('https://signed/r2.pdf', '_blank', 'noopener,noreferrer');
        open.mockRestore();
    });

    it('lists every other revision received, whichever one the card shows', async () => {
        // The card shows rev. 5 (accepted, then bounced): the history lists the delivered ones only.
        getQuote.mockResolvedValue({ ...RECEIVED, version: 5 });
        getQuoteHistory.mockResolvedValue({ in_progress: null, sent: SENT });
        renderPanel();

        const older = await screen.findByRole('region', { name: 'Revisioni precedenti' });
        expect(within(older).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
            expect.stringContaining('Rev. 3'), expect.stringContaining('Rev. 2'),
        ]);
    });

    it('shows the quote even when its history cannot be read', async () => {
        getQuoteHistory.mockRejectedValue(new Error('down'));
        renderPanel();

        expect(await screen.findByTestId('quote-card')).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Revisioni precedenti' })).not.toBeInTheDocument();
    });
});
