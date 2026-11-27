import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmationCard } from '../ConfirmationCard';
import { confirmationsApi } from '@/lib/confirmations-api';
import type { ConfirmationState, MeasureState, SectionState } from '@/types/confirmation';

jest.mock('@/lib/confirmations-api', () => ({
  confirmationsApi: { getState: jest.fn(), confirm: jest.fn() },
}));
// The card reads the house quote for its "Invia al team" button (ConfirmationCardRecap.test.tsx).
jest.mock('@/lib/quotes-api', () => ({
  quotesApi: { getQuote: jest.fn().mockResolvedValue(null), submitQuote: jest.fn() },
}));
const getState = confirmationsApi.getState as jest.Mock;
const confirm = confirmationsApi.confirm as jest.Mock;

const bagno = (patch: Partial<SectionState> = {}): SectionState => ({
  section_key: 'bagno1',
  label: 'Bagno',
  pending: true,
  measures: [
    {
      name: 'mq',
      label: 'Superficie pavimento',
      value: 6,
      source: 'estimated',
      proposed: null,
      candidates: [],
    },
    {
      name: 'mq_pareti',
      label: 'Superficie pareti',
      value: null,
      source: null,
      proposed: null,
      candidates: [],
    },
  ],
  element_choices: [
    {
      element: 'vasca',
      label: 'Vasca',
      action: 'replace',
      confirmed: false,
      options: [
        { action: 'replace', label: 'sostituisci' },
        { action: 'reuse', label: 'riutilizza' },
        { action: 'keep', label: 'lascia in posa' },
      ],
    },
  ],
  ...patch,
});

const cucina = (patch: Partial<SectionState> = {}): SectionState => ({
  section_key: 'cucina1',
  label: 'Cucina',
  pending: false,
  measures: [
    { name: 'mq', label: 'Superficie pavimento', value: 12, source: 'confirmed', proposed: null, candidates: [] },
  ],
  element_choices: [
    {
      element: 'piano',
      label: 'Piano cucina',
      action: 'keep',
      confirmed: true,
      options: [
        { action: 'replace', label: 'sostituisci' },
        { action: 'keep', label: 'lascia in posa' },
      ],
    },
  ],
  ...patch,
});

/** A section with one measure to confirm, already filled (SYD's estimate): its "Conferma" works at once. */
const quick = (patch: Partial<SectionState> = {}): SectionState =>
  bagno({ measures: [bagno().measures[0]], element_choices: [], ...patch });

const state = (patch: Partial<ConfirmationState> = {}): ConfirmationState => ({
  sections: [bagno()],
  editable: true,
  precision: null,
  ...patch,
});

function renderCard(props: { onAllConfirmed?: () => void } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    ...render(
      <QueryClientProvider client={client}>
        <ConfirmationCard projectId="chat-1" {...props} />
      </QueryClientProvider>,
    ),
    client,
  };
}

const confirmButton = () => screen.findByRole('button', { name: 'Conferma' });

beforeEach(() => {
  jest.clearAllMocks();
  getState.mockResolvedValue(state());
});

describe('ConfirmationCard — what the client confirms', () => {
  it('shows each measure to complete with where its value comes from, and the element choices as a summary', async () => {
    renderCard();

    expect(await screen.findByRole('region', { name: 'Riepilogo della richiesta' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bagno' })).toBeInTheDocument();
    expect(screen.getByLabelText('Superficie pavimento')).toHaveValue(6);
    expect(screen.getByText('stimata da SYD')).toBeInTheDocument();
    expect(screen.getByLabelText('Superficie pareti')).toHaveValue(null);
    expect(screen.getByText('da indicare')).toBeInTheDocument();
    // U3: an element choice is a summary row with "Modifica", never a field to confirm.
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifica Vasca' })).toBeInTheDocument();
  });

  it('confirms a section: the measures to complete go to the backend', async () => {
    confirm.mockResolvedValue({
      recalculated: true,
      blocked_sections: [],
      state: state({ sections: [] }),
    });
    const user = userEvent.setup();
    renderCard();

    await user.type(await screen.findByLabelText('Superficie pareti'), '18');
    await user.click(await confirmButton());

    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith('chat-1', 'bagno1', {
        measures: [
          { name: 'mq', value: 6 },
          { name: 'mq_pareti', value: 18 },
        ],
        element_choices: [],
      }),
    );
  });

  it('cannot confirm while a measure is still empty', async () => {
    renderCard();

    expect(await confirmButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('fills a measure from the quick picks when the chat gave different values', async () => {
    const conflict = bagno().measures.map((m) => (m.name === 'mq' ? { ...m, candidates: [5.5, 6] } : m));
    getState.mockResolvedValue(state({ sections: [bagno({ measures: conflict })] }));
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Usa 5,5' }));

    expect(screen.getByLabelText('Superficie pavimento')).toHaveValue(5.5);
  });

  it('shows the value the chat proposes after the client confirmed another one', async () => {
    const proposal = bagno().measures.map((m) =>
      m.name === 'mq' ? { ...m, source: 'confirmed' as const, proposed: 8 } : m,
    );
    getState.mockResolvedValue(state({ sections: [bagno({ measures: proposal })] }));
    const user = userEvent.setup();
    renderCard();

    expect(await screen.findByText(/Nuova indicazione dalla chat: 8/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Usa 8' }));

    expect(screen.getByLabelText('Superficie pavimento')).toHaveValue(8);
  });

  it('offers only the actions the library allows for an element', async () => {
    const noReuse = bagno({
      element_choices: [
        {
          element: 'wc',
          label: 'WC',
          action: 'replace',
          confirmed: false,
          options: [
            { action: 'replace', label: 'sostituisci' },
            { action: 'keep', label: 'lascia in posa' },
          ],
        },
      ],
    });
    getState.mockResolvedValue(state({ sections: [noReuse] }));
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Modifica WC' }));
    const group = await screen.findByRole('radiogroup', { name: 'WC' });
    expect(within(group).getAllByRole('radio')).toHaveLength(2);
    expect(within(group).queryByRole('radio', { name: 'Riutilizza' })).not.toBeInTheDocument();
  });

  it('shows a confirmed section closed, next to the one still to confirm', async () => {
    getState.mockResolvedValue(state({ sections: [cucina(), bagno()] }));
    renderCard();

    expect(await screen.findByRole('heading', { name: 'Bagno' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cucina' })).toBeInTheDocument();
    // The label is on both sections: the bathroom field and the kitchen summary.
    expect(screen.getAllByText('Superficie pavimento')).toHaveLength(2);
    expect(screen.getByText('12')).toBeInTheDocument();
    const row = screen.getByText('Piano cucina').parentElement as HTMLElement;
    expect(within(row).getByText('Lascia in posa')).toBeInTheDocument();
    // Only the section still to confirm has fields.
    expect(screen.getAllByRole('spinbutton')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Conferma' })).toHaveLength(1);
  });

  it('has no heading for a project without rooms', async () => {
    getState.mockResolvedValue(state({ sections: [bagno({ section_key: 'chat', label: null })] }));
    renderCard();

    await screen.findByRole('region', { name: 'Riepilogo della richiesta' });
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});

describe('ConfirmationCard — after the client confirms', () => {
  it('says how precise the estimate is, never an amount', async () => {
    const done = state({ sections: [], precision: 85 });
    confirm.mockResolvedValue({
      recalculated: true,
      blocked_sections: [],
      state: done,
    });
    getState.mockResolvedValueOnce(state({ sections: [quick()] })).mockResolvedValue(done);
    const user = userEvent.setup();
    const { container } = renderCard();

    await user.click(await confirmButton());

    expect(await screen.findByText('Stima precisa al 85 %')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/€|euro/i);
  });

  it('shows why a confirmation failed', async () => {
    confirm.mockRejectedValue({
      message: 'Il preventivo è già stato inviato al team.',
    });
    const user = userEvent.setup();
    renderCard();

    await user.type(await screen.findByLabelText('Superficie pareti'), '18');
    await user.click(await confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Il preventivo è già stato inviato al team.');
  });
});

describe('ConfirmationCard — one confirmation at a time', () => {
  it('locks every section while one is being saved', async () => {
    getState.mockResolvedValue(
      state({ sections: [quick(), quick({ section_key: 'cucina1', label: 'Cucina' })] }),
    );
    confirm.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderCard();

    const [first] = await screen.findAllByRole('button', { name: 'Conferma' });
    await user.click(first);

    await waitFor(() =>
      expect(
        screen
          .getAllByRole('button', { name: /Salvo|Conferma/ })
          .every((b) => b.getAttribute('aria-disabled') === 'true'),
      ).toBe(true),
    );
    await user.click(screen.getByRole('button', { name: 'Conferma' }));
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('says a value out of range is the problem, not an empty field', async () => {
    const user = userEvent.setup();
    renderCard();

    const input = await screen.findByLabelText('Superficie pavimento');
    await user.clear(input);
    await user.type(input, '20000');
    await user.type(screen.getByLabelText('Superficie pareti'), '18');

    expect(await confirmButton()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Ogni misura va da 0 a 10.000.')).toBeInTheDocument();
    expect(screen.queryByText('Indica tutte le misure per confermare.')).not.toBeInTheDocument();
  });

  it('closes once everything is confirmed and the estimate has no precision to show', async () => {
    const done = state({ sections: [], precision: null });
    confirm.mockResolvedValue({ recalculated: false, blocked_sections: [], state: done });
    getState.mockResolvedValueOnce(state({ sections: [quick()] })).mockResolvedValue(done);
    const user = userEvent.setup();
    renderCard();

    await user.click(await confirmButton());

    await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument());
    // The live region outlives the card: the last save is still read.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Bagno: confermato.'));
  });
});

describe('ConfirmationCard — when there is nothing to do', () => {
  it('is read-only once the quote is no longer a draft', async () => {
    getState.mockResolvedValue(state({ editable: false }));
    renderCard();

    expect(await screen.findByText('Per cambiare qualcosa scrivi in chat.')).toBeInTheDocument();
    expect(screen.getByLabelText('Superficie pavimento')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Modifica/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Conferma' })).not.toBeInTheDocument();
  });

  it('draws nothing when the quote is no longer a draft and nothing is pending', async () => {
    getState.mockResolvedValue(state({ editable: false, sections: [cucina()] }));
    const { container } = renderCard();

    await waitFor(() => expect(getState).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('draws nothing for a confirmed section with nothing to change', async () => {
    getState.mockResolvedValue(state({ sections: [cucina({ measures: [], element_choices: [] })] }));
    const { container } = renderCard();

    await waitFor(() => expect(getState).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('draws nothing when the state cannot be read (a guest gets 403)', async () => {
    getState.mockRejectedValue({ message: 'Accesso negato', status: 403 });
    const { container } = renderCard();

    await waitFor(() => expect(getState).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ConfirmationCard — changing one thing of a confirmed section', () => {
  const edit = async (user: ReturnType<typeof userEvent.setup>, voice: string) =>
    user.click(await screen.findByRole('button', { name: `Modifica ${voice}` }));

  beforeEach(() => {
    getState.mockResolvedValue(state({ sections: [cucina()], precision: 90 }));
  });

  it('lists every confirmed voice closed, each with its own "Modifica" and no section button', async () => {
    renderCard();

    expect(await screen.findByRole('button', { name: 'Modifica Superficie pavimento' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Modifica Piano cucina' })).toBeEnabled();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Conferma' })).not.toBeInTheDocument();
    expect(screen.getByText('Stima precisa al 90 %')).toBeInTheDocument();
  });

  it('opens only the voice to change, with its own Conferma and Annulla', async () => {
    const user = userEvent.setup();
    renderCard();

    await edit(user, 'Superficie pavimento');

    expect(screen.getByLabelText('Superficie pavimento')).toHaveValue(12);
    expect(screen.getByLabelText('Superficie pavimento')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Conferma' })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('button', { name: 'Annulla' })).toBeEnabled();
    // The other voice stays a summary, and nothing else can be opened meanwhile.
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifica Piano cucina' })).toBeDisabled();
  });

  it('sends only that measure, and shows the voice closed again with the new value', async () => {
    const changed = cucina({
      measures: [
        { name: 'mq', label: 'Superficie pavimento', value: 15, source: 'confirmed', proposed: null, candidates: [] },
      ],
    });
    confirm.mockResolvedValue({ recalculated: true, blocked_sections: [], state: state({ sections: [changed], precision: 95 }) });
    getState
      .mockResolvedValueOnce(state({ sections: [cucina()], precision: 90 }))
      .mockResolvedValue(state({ sections: [changed], precision: 95 }));
    const user = userEvent.setup();
    renderCard();

    await edit(user, 'Superficie pavimento');
    await user.clear(screen.getByLabelText('Superficie pavimento'));
    await user.type(screen.getByLabelText('Superficie pavimento'), '15');
    await user.click(screen.getByRole('button', { name: 'Conferma' }));

    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith('chat-1', 'cucina1', {
        measures: [{ name: 'mq', value: 15 }],
        element_choices: [],
      }),
    );
    expect(await screen.findByRole('button', { name: 'Modifica Superficie pavimento' })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('Stima precisa al 95 %')).toBeInTheDocument();
  });

  it('changes one element choice on its own', async () => {
    confirm.mockResolvedValue({ recalculated: true, blocked_sections: [], state: state({ sections: [cucina()] }) });
    const user = userEvent.setup();
    renderCard();

    await edit(user, 'Piano cucina');
    expect(screen.getByRole('radio', { name: 'Lascia in posa' })).toBeChecked();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Sostituisci' }));
    await user.click(screen.getByRole('button', { name: 'Conferma' }));

    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith('chat-1', 'cucina1', {
        measures: [],
        element_choices: [{ element: 'piano', action: 'replace' }],
      }),
    );
  });

  it('does not save on Enter: only the Conferma button does', async () => {
    const user = userEvent.setup();
    renderCard();

    await edit(user, 'Superficie pavimento');
    await user.type(screen.getByLabelText('Superficie pavimento'), '5{Enter}');

    expect(confirm).not.toHaveBeenCalled();
  });

  it('gives up on "Annulla": nothing is sent and the voice starts again from the confirmed value', async () => {
    const user = userEvent.setup();
    renderCard();

    await edit(user, 'Superficie pavimento');
    await user.clear(screen.getByLabelText('Superficie pavimento'));
    await user.type(screen.getByLabelText('Superficie pavimento'), '15');
    await user.click(screen.getByRole('button', { name: 'Annulla' }));

    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifica Superficie pavimento' })).toHaveFocus();
    await edit(user, 'Superficie pavimento');
    expect(screen.getByLabelText('Superficie pavimento')).toHaveValue(12);
  });

  it('keeps the voice open when saving fails, and drops the error on "Annulla"', async () => {
    confirm.mockRejectedValue({ message: 'Il preventivo è già stato inviato al team.' });
    const user = userEvent.setup();
    renderCard();

    await edit(user, 'Superficie pavimento');
    await user.click(screen.getByRole('button', { name: 'Conferma' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Il preventivo è già stato inviato al team.');
    expect(screen.getByLabelText('Superficie pavimento')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('still says why when the team took the quote while a confirmed voice was being changed', async () => {
    confirm.mockRejectedValue({ message: 'Il preventivo è già stato inviato al team.' });
    getState
      .mockResolvedValueOnce(state({ sections: [cucina()], precision: 90 }))
      .mockResolvedValue(state({ editable: false, sections: [cucina()], precision: 90 }));
    const user = userEvent.setup();
    renderCard();

    await edit(user, 'Superficie pavimento');
    await user.click(screen.getByRole('button', { name: 'Conferma' }));

    // Read again, nothing is left to change: the card closes, the reason stays.
    await waitFor(() => expect(getState).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('alert')).toHaveTextContent('Il preventivo è già stato inviato al team.');
    expect(screen.queryByLabelText('Superficie pavimento')).not.toBeInTheDocument();
  });

  it('says what is wrong with the value before it is sent', async () => {
    const user = userEvent.setup();
    renderCard();

    await edit(user, 'Superficie pavimento');
    await user.clear(screen.getByLabelText('Superficie pavimento'));

    expect(screen.getByRole('button', { name: 'Conferma' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Conferma' })).toHaveAccessibleDescription(
      'Indica tutte le misure per confermare.',
    );
  });

  it('is not offered once the quote is no longer a draft', async () => {
    getState.mockResolvedValue(state({ editable: false, sections: [cucina(), bagno()] }));
    renderCard();

    await screen.findByLabelText('Superficie pavimento');
    expect(screen.queryByRole('button', { name: /Modifica/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cucina' })).not.toBeInTheDocument();
  });

  it('cannot be opened while another section is being saved', async () => {
    getState.mockResolvedValue(state({ sections: [cucina(), quick()] }));
    confirm.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderCard();

    await user.click(await confirmButton());

    await waitFor(() => expect(screen.getByRole('button', { name: 'Modifica Superficie pavimento' })).toBeDisabled());
  });
});

describe('ConfirmationCard — a section half confirmed', () => {
  it('asks again only for what is still to confirm, with one Conferma', async () => {
    const half = bagno({
      measures: [
        { name: 'mq', label: 'Superficie pavimento', value: 8, source: 'confirmed', proposed: null, candidates: [] },
        { name: 'mq_pareti', label: 'Superficie pareti', value: null, source: null, proposed: null, candidates: [] },
      ],
      element_choices: [
        {
          element: 'vasca',
          label: 'Vasca',
          action: 'keep',
          confirmed: true,
          options: [
            { action: 'replace', label: 'sostituisci' },
            { action: 'keep', label: 'lascia in posa' },
          ],
        },
      ],
    });
    getState.mockResolvedValue(state({ sections: [half] }));
    confirm.mockResolvedValue({ recalculated: true, blocked_sections: [], state: state({ sections: [] }) });
    const user = userEvent.setup();
    renderCard();

    // What is confirmed is a summary; only the missing measure is a field.
    expect(await screen.findByRole('button', { name: 'Modifica Superficie pavimento' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifica Vasca' })).toBeInTheDocument();
    expect(screen.getAllByRole('spinbutton')).toHaveLength(1);
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Superficie pareti'), '18');
    await user.click(screen.getByRole('button', { name: 'Conferma' }));

    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith('chat-1', 'bagno1', {
        measures: [{ name: 'mq_pareti', value: 18 }],
        element_choices: [],
      }),
    );
  });

  it('shows a new proposal from the chat as the only thing to confirm', async () => {
    const proposal = bagno({
      measures: [
        { name: 'mq', label: 'Superficie pavimento', value: 5, source: 'confirmed', proposed: 8, candidates: [] },
        { name: 'mq_pareti', label: 'Superficie pareti', value: 18, source: 'confirmed', proposed: null, candidates: [] },
      ],
      element_choices: [],
    });
    getState.mockResolvedValue(state({ sections: [proposal] }));
    renderCard();

    expect(await screen.findByText(/Nuova indicazione dalla chat: 8/)).toBeInTheDocument();
    expect(screen.getAllByRole('spinbutton')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Modifica Superficie pareti' })).toBeInTheDocument();
  });
});

describe('ConfirmationCard — when the card is read again while the client is changing something', () => {
  const edit = async (user: ReturnType<typeof userEvent.setup>, voice: string) =>
    user.click(await screen.findByRole('button', { name: `Modifica ${voice}` }));
  const readAgain = (client: { invalidateQueries: () => Promise<void> }) => act(() => client.invalidateQueries());
  const withMeasure = (patch: Partial<MeasureState>) =>
    cucina({
      measures: [
        { name: 'mq', label: 'Superficie pavimento', value: 12, source: 'confirmed', proposed: null, candidates: [], ...patch },
      ],
    });

  it('does not take the focus back once it has been given to "Modifica"', async () => {
    getState.mockResolvedValue(state({ sections: [cucina()] }));
    const user = userEvent.setup();
    const { client } = renderCard();

    await edit(user, 'Superficie pavimento');
    await user.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(screen.getByRole('button', { name: 'Modifica Superficie pavimento' })).toHaveFocus();

    // The client goes on writing in the chat; the card is read again with other values.
    (document.activeElement as HTMLElement).blur();
    getState.mockResolvedValue(state({ sections: [withMeasure({ value: 14 })] }));
    await readAgain(client);

    await screen.findByText('14');
    expect(screen.getByRole('button', { name: 'Modifica Superficie pavimento' })).not.toHaveFocus();
  });

  it('closes the open voice when the chat proposes another value for it: nothing stays locked', async () => {
    getState.mockResolvedValue(state({ sections: [cucina()] }));
    const user = userEvent.setup();
    const { client } = renderCard();

    await edit(user, 'Superficie pavimento');
    getState.mockResolvedValue(state({ sections: [withMeasure({ proposed: 20 })] }));
    await readAgain(client);

    expect(await screen.findByText(/Nuova indicazione dalla chat: 20/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifica Piano cucina' })).toBeEnabled();
  });

  it('drops the open voice when the quote stops being a draft', async () => {
    getState.mockResolvedValue(state({ sections: [cucina()] }));
    const user = userEvent.setup();
    const { client, container } = renderCard();

    await edit(user, 'Superficie pavimento');
    getState.mockResolvedValue(state({ editable: false, sections: [cucina()] }));
    await readAgain(client);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('does not confirm what is still pending while a voice is open', async () => {
    const half = bagno({
      measures: [
        { name: 'mq', label: 'Superficie pavimento', value: 8, source: 'confirmed', proposed: null, candidates: [] },
        { name: 'mq_pareti', label: 'Superficie pareti', value: 18, source: 'estimated', proposed: null, candidates: [] },
      ],
      element_choices: [],
    });
    getState.mockResolvedValue(state({ sections: [half] }));
    const user = userEvent.setup();
    renderCard();

    await edit(user, 'Superficie pavimento');

    // "Da completare" comes first, the summary (with the open voice) below it.
    const [groupButton, voiceButton] = screen.getAllByRole('button', { name: 'Conferma' });
    expect(voiceButton).not.toHaveAttribute('aria-disabled');
    expect(groupButton).toHaveAttribute('aria-disabled', 'true');
    expect(groupButton).toHaveAccessibleDescription('Chiudi prima la modifica aperta.');
  });

  it('names the voice being changed, so two "Conferma" can be told apart', async () => {
    getState.mockResolvedValue(state({ sections: [cucina()] }));
    const user = userEvent.setup();
    renderCard();

    await edit(user, 'Piano cucina');

    expect(screen.getByRole('group', { name: 'Modifica Piano cucina' })).toBeInTheDocument();
  });

  it('keeps what the client is typing; the fields not touched take the new server value', async () => {
    const user = userEvent.setup();
    const { client } = renderCard();

    await user.type(await screen.findByLabelText('Superficie pareti'), '18');
    const moved = bagno().measures.map((m) => (m.name === 'mq' ? { ...m, value: 7 } : m));
    getState.mockResolvedValue(state({ sections: [bagno({ measures: moved })] }));
    await readAgain(client);

    await waitFor(() => expect(screen.getByLabelText('Superficie pavimento')).toHaveValue(7));
    expect(screen.getByLabelText('Superficie pareti')).toHaveValue(18);
  });

  it('closes the open voice when the quote stops being a draft, other sections still shown', async () => {
    getState.mockResolvedValue(state({ sections: [cucina(), bagno()] }));
    const user = userEvent.setup();
    const { client } = renderCard();

    await edit(user, 'Superficie pavimento');
    getState.mockResolvedValue(state({ editable: false, sections: [cucina(), bagno()] }));
    await readAgain(client);

    expect(await screen.findByText('Per cambiare qualcosa scrivi in chat.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Modifica/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bagno' })).toBeInTheDocument();
  });

  it.each([
    ['its value is now an estimate of SYD', withMeasure({ source: 'estimated' }), 'Superficie pavimento'],
    ['its value is now in conflict', withMeasure({ candidates: [10, 14] }), 'Superficie pavimento'],
  ])('closes the open voice when %s: it is a field to confirm again', async (_, changed, voice) => {
    getState.mockResolvedValue(state({ sections: [cucina()] }));
    const user = userEvent.setup();
    const { client } = renderCard();

    await edit(user, voice);
    getState.mockResolvedValue(state({ sections: [changed] }));
    await readAgain(client);

    await waitFor(() => expect(screen.queryByRole('group', { name: `Modifica ${voice}` })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Conferma' })).toBeInTheDocument();
  });
});

describe('ConfirmationCard — while saving and after', () => {
  const deferred = () => {
    let resolve: (value: unknown) => void = () => undefined;
    const promise = new Promise((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };
  const half = () =>
    bagno({
      measures: [
        { name: 'mq', label: 'Superficie pavimento', value: 8, source: 'confirmed', proposed: null, candidates: [] },
        { name: 'mq_pareti', label: 'Superficie pareti', value: 18, source: 'estimated', proposed: null, candidates: [] },
      ],
      element_choices: [],
    });

  it('shows "Salvo…" only on the button that saved', async () => {
    getState.mockResolvedValue(state({ sections: [half()] }));
    confirm.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Modifica Superficie pavimento' }));
    const editor = screen.getByRole('group', { name: 'Modifica Superficie pavimento' });
    await user.click(within(editor).getByRole('button', { name: 'Conferma' }));

    await waitFor(() => expect(within(editor).getByRole('button', { name: 'Salvo…' })).toBeInTheDocument());
    expect(screen.getAllByText('Salvo…')).toHaveLength(1);
  });

  it('keeps the focus on the button that saves, marked as not available', async () => {
    getState.mockResolvedValue(state({ sections: [half()] }));
    confirm.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderCard();

    await user.click(await confirmButton());

    const saving = await screen.findByRole('button', { name: 'Salvo…' });
    expect(saving).toHaveFocus();
    expect(saving).toHaveAttribute('aria-disabled', 'true');
    await user.click(saving);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('announces the save and its result in a live region', async () => {
    getState.mockResolvedValue(state({ sections: [half()] }));
    const reply = deferred();
    confirm.mockReturnValue(reply.promise);
    const user = userEvent.setup();
    renderCard();

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('');
    await user.click(await confirmButton());
    await waitFor(() => expect(status).toHaveTextContent('Salvataggio…'));

    await act(async () => reply.resolve({ recalculated: true, blocked_sections: [], state: state({ sections: [], precision: 80 }) }));
    await waitFor(() => expect(status).toHaveTextContent('Bagno: confermato. Stima aggiornata.'));
  });

  it('tells which rooms still miss a measure when the estimate could not be updated', async () => {
    const cucinaPending = bagno({ section_key: 'cucina1', label: 'Cucina', element_choices: [] });
    getState
      .mockResolvedValueOnce(state({ sections: [half(), cucinaPending] }))
      .mockResolvedValue(state({ sections: [cucinaPending] }));
    confirm.mockResolvedValue({
      recalculated: false,
      blocked_sections: ['cucina1'],
      state: state({ sections: [cucinaPending] }),
    });
    const user = userEvent.setup();
    renderCard();

    const [bagnoConfirm] = await screen.findAllByRole('button', { name: 'Conferma' });
    await user.click(bagnoConfirm);

    expect(await screen.findByText('Stima non aggiornata: manca una misura in Cucina.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Bagno: confermato. Stima non aggiornata: manca una misura in Cucina.');

    // A failed save later says nothing new about the estimate: the note stays.
    confirm.mockRejectedValue({ message: 'Errore di rete.' });
    await user.type(screen.getByLabelText('Superficie pareti'), '9');
    await user.click(screen.getByRole('button', { name: 'Conferma' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Errore di rete.');
    expect(screen.getByText('Stima non aggiornata: manca una misura in Cucina.')).toBeInTheDocument();
  });

  it('does not name the rooms when a blocked section has no name', async () => {
    const unnamed = bagno({ section_key: 'chat', label: null, element_choices: [] });
    getState.mockResolvedValueOnce(state({ sections: [half(), unnamed] })).mockResolvedValue(state({ sections: [unnamed] }));
    confirm.mockResolvedValue({ recalculated: false, blocked_sections: ['chat'], state: state({ sections: [unnamed] }) });
    const user = userEvent.setup();
    renderCard();

    const [bagnoConfirm] = await screen.findAllByRole('button', { name: 'Conferma' });
    await user.click(bagnoConfirm);

    expect(await screen.findByText('Stima non aggiornata: manca ancora una misura.')).toBeInTheDocument();
  });
});


describe('ConfirmationCard — the last confirmation restarts the agent', () => {
  const afterSave = (sections: SectionState[], blocked: string[] = []) =>
    confirm.mockResolvedValue({ recalculated: blocked.length === 0, blocked_sections: blocked, state: state({ sections }) });

  it('tells once that everything is confirmed, when the save leaves nothing to confirm', async () => {
    const onAllConfirmed = jest.fn();
    afterSave([cucina()]);
    getState.mockResolvedValueOnce(state({ sections: [quick()] })).mockResolvedValue(state({ sections: [cucina()] }));
    const user = userEvent.setup();
    renderCard({ onAllConfirmed });

    await user.click(await confirmButton());

    await waitFor(() => expect(onAllConfirmed).toHaveBeenCalledTimes(1));
  });

  it('does not tell while another section is still to confirm', async () => {
    const onAllConfirmed = jest.fn();
    const altro = bagno({ section_key: 'camera1', label: 'Camera' });
    afterSave([cucina(), altro]);
    getState.mockResolvedValueOnce(state({ sections: [quick(), altro] }));
    const user = userEvent.setup();
    renderCard({ onAllConfirmed });

    await user.click((await screen.findAllByRole('button', { name: 'Conferma' }))[0]);

    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(onAllConfirmed).not.toHaveBeenCalled();
  });

  it('does not tell while the estimate is blocked for a missing measure', async () => {
    const onAllConfirmed = jest.fn();
    afterSave([cucina()], ['cucina1']);
    getState.mockResolvedValueOnce(state({ sections: [quick()] }));
    const user = userEvent.setup();
    renderCard({ onAllConfirmed });

    await user.click(await confirmButton());

    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(onAllConfirmed).not.toHaveBeenCalled();
  });

  it('does not tell when the save fails', async () => {
    const onAllConfirmed = jest.fn();
    confirm.mockRejectedValue(new Error('boom'));
    getState.mockResolvedValueOnce(state({ sections: [quick()] }));
    const user = userEvent.setup();
    renderCard({ onAllConfirmed });

    await user.click(await confirmButton());

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onAllConfirmed).not.toHaveBeenCalled();
  });

  it('tells once for a double click: the card locks while it saves', async () => {
    const onAllConfirmed = jest.fn();
    afterSave([cucina()]);
    getState.mockResolvedValueOnce(state({ sections: [quick()] })).mockResolvedValue(state({ sections: [cucina()] }));
    const user = userEvent.setup();
    renderCard({ onAllConfirmed });
    const button = await confirmButton();

    await user.dblClick(button);

    await waitFor(() => expect(onAllConfirmed).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('does not tell for a change to something already confirmed: nothing was left to confirm', async () => {
    const onAllConfirmed = jest.fn();
    getState.mockResolvedValue(state({ sections: [cucina()] }));
    afterSave([cucina({ measures: [{ name: 'mq', label: 'Superficie pavimento', value: 14, source: 'confirmed', proposed: null, candidates: [] }] })]);
    const user = userEvent.setup();
    renderCard({ onAllConfirmed });

    await user.click((await screen.findAllByRole('button', { name: /Modifica/ }))[0]);
    await user.click(await confirmButton());

    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(onAllConfirmed).not.toHaveBeenCalled();
  });
});
