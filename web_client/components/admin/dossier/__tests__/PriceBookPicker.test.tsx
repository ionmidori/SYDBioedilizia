import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { PriceBookPicker, quoteItemFromPriceBook } from '../PriceBookPicker';
import { usePriceBook } from '@/hooks/admin/use-admin';
import type { PriceBookItem } from '@/types/admin-price-book';

jest.mock('@/hooks/admin/use-admin');
const mockBook = usePriceBook as jest.MockedFunction<typeof usePriceBook>;

const ITEMS: PriceBookItem[] = [
  { sku: 'DEM-001', description: 'Demolizione tramezzi', unit: 'mq', unit_price: 25, category: 'Demolizioni', vat_agevolata: false, tags: [] },
  { sku: 'BAG-001', description: 'Sanitari sospesi', unit: 'cad', unit_price: 300, category: 'Bagno', vat_agevolata: false, tags: ['wc'], min_qty: 2 },
];

function load(state: Record<string, unknown> = {}) {
  mockBook.mockReturnValue({ isPending: false, isError: false, data: { items: ITEMS }, ...state } as unknown as ReturnType<typeof usePriceBook>);
}

describe('quoteItemFromPriceBook', () => {
  it('uses the official sku, unit and price; quantity 1 or the minimum order', () => {
    expect(quoteItemFromPriceBook(ITEMS[0])).toMatchObject({ sku: 'DEM-001', unit: 'mq', unit_price: 25, qty: 1, manual_override: true });
    expect(quoteItemFromPriceBook(ITEMS[1]).qty).toBe(2);
  });
});

describe('PriceBookPicker', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not even load the price book while closed', () => {
    load();
    render(<PriceBookPicker open={false} onOpenChange={jest.fn()} onPick={jest.fn()} />);
    expect(mockBook).not.toHaveBeenCalled();
  });

  it('searches, then adds the chosen line and closes', () => {
    load();
    const onPick = jest.fn();
    const onOpenChange = jest.fn();
    render(<PriceBookPicker open onOpenChange={onOpenChange} onPick={onPick} />);
    expect(screen.getAllByTestId('picker-row')).toHaveLength(2);

    fireEvent.change(screen.getByTestId('picker-search'), { target: { value: 'sanitari wc' } });
    expect(screen.getAllByTestId('picker-row')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi BAG-001' }));

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ sku: 'BAG-001', unit_price: 300 }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('says when nothing matches and when the list cannot be loaded', () => {
    load();
    const { rerender } = render(<PriceBookPicker open onOpenChange={jest.fn()} onPick={jest.fn()} />);
    fireEvent.change(screen.getByTestId('picker-search'), { target: { value: 'zzz' } });
    expect(screen.getByTestId('picker-empty')).toBeInTheDocument();

    load({ isError: true, data: undefined });
    rerender(<PriceBookPicker open onOpenChange={jest.fn()} onPick={jest.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Impossibile caricare il listino');
  });
});
