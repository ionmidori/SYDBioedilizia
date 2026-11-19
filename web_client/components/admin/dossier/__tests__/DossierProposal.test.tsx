import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { DossierProposal } from '../DossierProposal';
import type { QuoteProposal } from '@/types/admin-quote';
import type { QuoteItem, QuoteRoom } from '@/types/quote';

function item(sku: string, roomId: string, qty = 1): QuoteItem {
  return { sku, description: sku, unit: 'mq', qty, unit_price: 10, total: qty * 10, manual_override: false, room_id: roomId };
}

const BAGNO: QuoteRoom = { room_id: 'bagno1', room_label: 'Bagno', room_type: 'bagno', room_subtotal: 0 };
const CUCINA: QuoteRoom = { room_id: 'cucina1', room_label: 'Cucina', room_type: 'cucina', room_subtotal: 0 };
const SALONE: QuoteRoom = { room_id: 'salone1', room_label: 'Salone', room_type: 'soggiorno', room_subtotal: 0 };

function proposal(overrides: Partial<QuoteProposal> = {}): QuoteProposal {
  return {
    based_on_version: 3,
    created_at: '2026-11-19T10:00:00Z',
    summary: 'Aggiunto il salone, bagno più grande',
    items: [item('BAG-RIV-001', 'bagno1', 12), item('CUC-TOP-002', 'cucina1'), item('PIT-001', 'salone1', 30)],
    rooms: [BAGNO, CUCINA, SALONE],
    financials: { subtotal: 430, vat_rate: 0.22, vat_amount: 94.6, grand_total: 524.6 },
    estimate: { low: 500, high: 700, precision: 70, policy_version: 'v1' },
    manual_work: [],
    ai_warnings: [],
    applied_at: null,
    ...overrides,
  };
}

const QUOTE_ITEMS = [item('BAG-RIV-001', 'bagno1', 8), item('CUC-TOP-002', 'cucina1')];

function renderPanel(props: Partial<React.ComponentProps<typeof DossierProposal>> = {}) {
  const onApply = jest.fn();
  render(
    <DossierProposal
      proposal={proposal()}
      quoteVersion={3}
      quoteRooms={[BAGNO, CUCINA]}
      quoteItems={QUOTE_ITEMS}
      vatRate={0.22}
      canApply
      pending={false}
      onApply={onApply}
      {...props}
    />,
  );
  return onApply;
}

describe('DossierProposal', () => {
  it('shows the proposal with its estimate and the rooms it adds or changes', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: /Proposta AI di revisione del/ })).toBeInTheDocument();
    expect(screen.getByText('Aggiunto il salone, bagno più grande')).toBeInTheDocument();
    expect(screen.getByTestId('estimate-range')).toBeInTheDocument();
    expect(screen.getByTestId('proposal-rooms-added')).toHaveTextContent('Salone');
    expect(screen.getByTestId('proposal-rooms-changed')).toHaveTextContent('Bagno');
    expect(screen.getByTestId('proposal-rooms-changed')).not.toHaveTextContent('Cucina');
  });

  it('shows the total with the VAT rate of the quote, as the apply computes it', () => {
    renderPanel({ vatRate: 0.1 });
    // 430 + 10 %: the proposal's own 22 % total (524,60) is not what the draft gets.
    expect(screen.getByTestId('proposal-total')).toHaveTextContent('473,00');
  });

  it('names the rooms of the quote the proposal drops', () => {
    renderPanel({ quoteRooms: [BAGNO, CUCINA, { ...SALONE, room_id: 'camera1', room_label: 'Camera' }] });
    expect(screen.getByTestId('proposal-rooms-removed')).toHaveTextContent('Camera');
  });

  it('applies only after the confirmation', () => {
    const onApply = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Applica alla bozza' }));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Conferma' }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('can cancel the confirmation', () => {
    const onApply = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Applica alla bozza' }));
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Applica alla bozza' })).toBeInTheDocument();
  });

  it('cannot be applied while the quote is not editable', () => {
    renderPanel({ canApply: false, disabledReason: 'Salva prima le modifiche' });
    const button = screen.getByRole('button', { name: 'Applica alla bozza' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Salva prima le modifiche');
  });

  it('says a proposal made on an older version is outdated, with nothing to apply', () => {
    renderPanel({ quoteVersion: 4 });
    expect(screen.getByTestId('proposal-outdated')).toHaveTextContent('revisione 3');
    expect(screen.queryByRole('button', { name: 'Applica alla bozza' })).not.toBeInTheDocument();
  });

  it('is hidden without a proposal or once applied', () => {
    const { container } = render(
      <DossierProposal
        proposal={null}
        quoteVersion={3}
        quoteRooms={[]}
        quoteItems={[]}
        vatRate={0.22}
        canApply
        pending={false}
        onApply={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    const applied = render(
      <DossierProposal
        proposal={proposal({ applied_at: '2026-11-19T11:00:00Z' })}
        quoteVersion={4}
        quoteRooms={[]}
        quoteItems={[]}
        vatRate={0.22}
        canApply
        pending={false}
        onApply={jest.fn()}
      />,
    );
    expect(applied.container).toBeEmptyDOMElement();
  });
});
