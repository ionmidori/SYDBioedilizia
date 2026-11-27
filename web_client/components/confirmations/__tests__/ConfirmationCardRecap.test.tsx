import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmationCard } from '../ConfirmationCard';
import { confirmationsApi } from '@/lib/confirmations-api';
import { quotesApi } from '@/lib/quotes-api';
import type { ConfirmationState, SectionState } from '@/types/confirmation';

/**
 * The card is the summary of the request (card-recap flow, PR A): what the client said and what
 * the code computed is accepted, only what is missing is asked under "Da completare", and the
 * "Invia al team" button of the card is the only way the request reaches the team (U1).
 */

jest.mock('@/lib/confirmations-api', () => ({
  confirmationsApi: { getState: jest.fn(), confirm: jest.fn() },
}));
jest.mock('@/lib/quotes-api', () => ({
  quotesApi: { getQuote: jest.fn(), submitQuote: jest.fn() },
}));
// Dialog on desktop / Vaul drawer on mobile: the switch is not under test here.
jest.mock('@/components/ui/responsive-drawer', () => ({
  ResponsiveDrawer: ({ open, title, children }: { open?: boolean; title?: string; children: React.ReactNode }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

const getState = confirmationsApi.getState as jest.Mock;
const getQuote = quotesApi.getQuote as jest.Mock;
const submitQuote = quotesApi.submitQuote as jest.Mock;

const VASCA = {
  element: 'vasca',
  label: 'Vasca',
  action: 'replace' as const,
  confirmed: false,
  options: [
    { action: 'replace' as const, label: 'sostituisci' },
    { action: 'keep' as const, label: 'lascia in posa' },
  ],
};

/** What the client said, what the code computed, an element choice nobody confirmed: nothing to answer. */
const summary = (patch: Partial<SectionState> = {}): SectionState => ({
  section_key: 'bagno1',
  label: 'Bagno',
  pending: false,
  measures: [
    { name: 'mq', label: 'pavimento della stanza (m²)', value: 6, source: 'declared', proposed: null, candidates: [] },
    { name: 'mq_pareti', label: 'pareti (m²)', value: 20, source: 'calculated', proposed: null, candidates: [] },
  ],
  element_choices: [VASCA],
  ...patch,
});

/** A measure from a photo and one missing: the client answers them. */
const toComplete = (): SectionState =>
  summary({
    pending: true,
    measures: [
      { name: 'mq', label: 'pavimento della stanza (m²)', value: 6, source: 'photo', proposed: null, candidates: [] },
      { name: 'mq_pareti', label: 'pareti (m²)', value: null, source: null, proposed: null, candidates: [] },
      { name: 'ml', label: 'battiscopa (m)', value: 10, source: 'declared', proposed: null, candidates: [] },
    ],
  });

const state = (patch: Partial<ConfirmationState> = {}): ConfirmationState => ({
  sections: [summary()],
  editable: true,
  precision: 80,
  ...patch,
});

const DRAFT = {
  project_id: 'chat-1',
  user_id: 'u1',
  status: 'draft',
  items: [{ sku: 'X', description: 'Posa gres', unit: 'mq', qty: 6, unit_price: 0, total: 0, room_id: 'bagno1' }],
};

function renderCard(props: { onQuoteSent?: () => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ConfirmationCard projectId="chat-1" {...props} />
    </QueryClientProvider>,
  );
}

const sendButton = () => screen.findByRole('button', { name: 'Invia al team' });

beforeEach(() => {
  jest.clearAllMocks();
  getState.mockResolvedValue(state());
  getQuote.mockResolvedValue(DRAFT);
});

describe('ConfirmationCard — the summary of the request', () => {
  it('is titled as the summary of the request', async () => {
    renderCard();
    expect(await screen.findByRole('region', { name: 'Riepilogo della richiesta' })).toBeInTheDocument();
  });

  it('accepts what the client said, the calculations and the element choices: each a row with "Modifica"', async () => {
    renderCard();

    const card = await screen.findByRole('region', { name: 'Riepilogo della richiesta' });
    expect(within(card).queryByText('Da completare')).not.toBeInTheDocument();
    expect(within(card).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(card).queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(within(card).queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(within(card).getAllByRole('button', { name: /^Modifica/ })).toHaveLength(3);
    expect(within(card).queryByRole('button', { name: 'Conferma' })).not.toBeInTheDocument();
  });

  it('asks only what is missing, on top under "Da completare", with one "Conferma"', async () => {
    getState.mockResolvedValue(state({ sections: [toComplete()] }));
    renderCard();

    const heading = await screen.findByText('Da completare');
    const fields = screen.getAllByRole('spinbutton');
    expect(fields.map((field) => field.getAttribute('aria-label') ?? field.id)).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Conferma' })).toBeInTheDocument();
    // The declared measure and the choice are a summary below the fields to complete.
    const row = screen.getByRole('button', { name: /^Modifica.*battiscopa/i });
    expect(heading.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fields[1].compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('ConfirmationCard — "Invia al team"', () => {
  it('sends from the card: the dialog, the request, then the signal for the chat', async () => {
    submitQuote.mockResolvedValue({ project_id: 'chat-1', status: 'pending_review', duplicate: false });
    const onQuoteSent = jest.fn();
    const user = userEvent.setup();
    renderCard({ onQuoteSent });

    const button = await sendButton();
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
    await user.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Invia al team' });
    await user.click(within(dialog).getByRole('button', { name: 'Invia al team' }));

    await waitFor(() => expect(submitQuote).toHaveBeenCalledWith('chat-1', expect.any(String)));
    await waitFor(() => expect(onQuoteSent).toHaveBeenCalledTimes(1));
  });

  it('sends no signal when the request was already with the team', async () => {
    submitQuote.mockResolvedValue({ project_id: 'chat-1', status: 'pending_review', duplicate: true });
    const onQuoteSent = jest.fn();
    const user = userEvent.setup();
    renderCard({ onQuoteSent });

    const button = await sendButton();
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
    await user.click(button);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Invia al team' }));

    await waitFor(() => expect(submitQuote).toHaveBeenCalled());
    expect(await screen.findByText(/La richiesta è con il nostro team/)).toBeInTheDocument();
    expect(onQuoteSent).not.toHaveBeenCalled();
  });

  it('waits for what is missing, and says so', async () => {
    getState.mockResolvedValue(state({ sections: [toComplete()] }));
    const user = userEvent.setup();
    renderCard();

    const button = await sendButton();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Completa le misure di Bagno.');
    await user.click(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('waits for the works of the request, and says so', async () => {
    getQuote.mockResolvedValue({ ...DRAFT, items: [] });
    renderCard();

    const button = await sendButton();
    await waitFor(() => expect(button).toHaveAccessibleDescription('La richiesta non ha ancora lavorazioni.'));
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('is not there once the quote is with the team', async () => {
    getState.mockResolvedValue(state({ editable: false, sections: [toComplete()] }));
    renderCard();

    await screen.findByRole('region', { name: 'Riepilogo della richiesta' });
    expect(screen.queryByRole('button', { name: 'Invia al team' })).not.toBeInTheDocument();
  });
});

describe('ConfirmationCard — "Invia al team" in the edge cases (final review of PR A)', () => {
  it('keeps the confirmation of the send on screen when the card turns read-only', async () => {
    submitQuote.mockResolvedValue({ project_id: 'chat-1', status: 'pending_review', duplicate: false });
    getState.mockResolvedValueOnce(state()).mockResolvedValue(state({ editable: false }));
    const user = userEvent.setup();
    renderCard();

    const button = await sendButton();
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
    await user.click(button);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Invia al team' }));

    expect(await screen.findByText(/Richiesta inviata/)).toBeInTheDocument();
    // The card is read again after the send (the quote is with the team): the message stays.
    await waitFor(() => expect(getState.mock.calls.length).toBeGreaterThan(1));
    expect(screen.getByText(/Richiesta inviata/)).toBeInTheDocument();
  });

  it('offers the button when the request has no section to show but has works', async () => {
    getState.mockResolvedValue(state({ sections: [] }));
    renderCard();

    const button = await sendButton();
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
  });

  it('offers the button when the card cannot be read but the draft has works', async () => {
    getState.mockRejectedValue({ message: 'Errore', status: 500 });
    renderCard();

    expect(await sendButton()).toBeInTheDocument();
  });

  it('draws nothing without sections when the request has no works yet', async () => {
    getState.mockResolvedValue(state({ sections: [] }));
    getQuote.mockResolvedValue({ ...DRAFT, items: [] });
    renderCard();

    await waitFor(() => expect(getQuote).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Invia al team' })).not.toBeInTheDocument();
  });
});
