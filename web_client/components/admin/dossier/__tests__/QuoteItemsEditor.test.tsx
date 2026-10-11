import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { QuoteItemsEditor } from '../QuoteItemsEditor';
import type { QuoteItem } from '@/types/quote';

const base: QuoteItem = {
  sku: 'PIT-001',
  description: 'Pittura pareti',
  unit: 'mq',
  qty: 10,
  unit_price: 12.5,
  total: 125,
  manual_override: false,
  ai_reasoning: 'Superficie dichiarata dal cliente',
};

function setup(overrides: Partial<React.ComponentProps<typeof QuoteItemsEditor>> = {}) {
  const onChange = jest.fn();
  render(
    <QuoteItemsEditor items={[base]} saved={[base]} errors={new Map()} readOnly={false} onChange={onChange} {...overrides} />,
  );
  return onChange;
}

describe('QuoteItemsEditor', () => {
  it('reports an edit upwards and shows the line total from qty x price', () => {
    const onChange = setup();
    expect(screen.getByTestId('item-total-0')).toHaveTextContent('125,00');
    fireEvent.change(screen.getByTestId('item-qty-0'), { target: { value: '12' } });
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ sku: 'PIT-001', qty: 12 })]);
  });

  it('highlights only the lines that differ from the saved version', () => {
    setup({ items: [base, { ...base, sku: 'PIT-002', qty: 3 }], saved: [base, { ...base, sku: 'PIT-002', qty: 2 }] });
    const rows = screen.getAllByTestId('items-row');
    expect(rows[0]).not.toHaveAttribute('data-changed');
    expect(rows[1]).toHaveAttribute('data-changed', 'true');
    expect(rows[1]).toHaveTextContent('modificata');
  });

  it('shows the AI reasoning and adds a manual line', () => {
    const onChange = setup();
    expect(screen.getByText('Superficie dichiarata dal cliente')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('add-item'));
    expect(onChange).toHaveBeenCalledWith([base, expect.objectContaining({ sku: 'MANUALE-001', manual_override: true })]);
  });

  it('removes a line', () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole('button', { name: /Rimuovi la voce Pittura pareti/ }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('is read-only when the quote cannot be edited', () => {
    setup({ readOnly: true });
    expect(screen.getByTestId('item-qty-0')).toBeDisabled();
    expect(screen.queryByTestId('add-item')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rimuovi/ })).not.toBeInTheDocument();
  });

  it('shows per-field errors', () => {
    setup({ errors: new Map([[0, { qty: 'Quantità non valida' }]]) });
    expect(screen.getByRole('alert')).toHaveTextContent('Quantità non valida');
    expect(screen.getByTestId('item-qty-0')).toHaveAttribute('aria-invalid', 'true');
  });
});
