import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { PriceBookEditor } from '../PriceBookEditor';
import { usePriceBook, usePriceBookHistory, useSavePriceBook } from '@/hooks/admin/use-admin';
import { AdminApiError } from '@/lib/admin/admin-api';
import type { PriceBookItem, PriceBookResponse } from '@/types/admin-price-book';

jest.mock('@/hooks/admin/use-admin');
const mockBook = usePriceBook as jest.MockedFunction<typeof usePriceBook>;
const mockSave = useSavePriceBook as jest.MockedFunction<typeof useSavePriceBook>;
const mockHistory = usePriceBookHistory as jest.MockedFunction<typeof usePriceBookHistory>;

function item(overrides: Partial<PriceBookItem> = {}): PriceBookItem {
  return {
    sku: 'DEM-001',
    description: 'Demolizione tramezzi',
    unit: 'mq',
    unit_price: 25,
    category: 'Demolizioni',
    vat_agevolata: false,
    tags: [],
    ...overrides,
  };
}

const ITEMS = [
  item(),
  item({ sku: 'BAG-001', description: 'Sanitari sospesi', category: 'Bagno', unit: 'cad', unit_price: 300 }),
  item({ sku: 'BAG-002', description: 'Piatto doccia', category: 'Bagno', unit: 'cad', unit_price: 180 }),
];

function book(overrides: Partial<PriceBookResponse> = {}, extra: Record<string, unknown> = {}) {
  mockBook.mockReturnValue({
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
    data: { etag: '"v2"', version: 2, source: 'firestore', item_count: ITEMS.length, items: ITEMS, ...overrides },
    ...extra,
  } as unknown as ReturnType<typeof usePriceBook>);
}

const saveMutation = { mutate: jest.fn(), isPending: false, error: null as unknown, reset: jest.fn() };

describe('PriceBookEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    saveMutation.error = null;
    mockSave.mockReturnValue(saveMutation as unknown as ReturnType<typeof useSavePriceBook>);
    mockHistory.mockReturnValue({
      isPending: false,
      isError: false,
      data: { items: [{ version: 2, reason: 'Prezzi 2026', added: 1, removed: 0, changed: 2, created_at: '2026-10-10T10:00:00Z' }] },
    } as unknown as ReturnType<typeof usePriceBookHistory>);
  });

  it('shows the list, its version and the explanation of what it is for', () => {
    book();
    render(<PriceBookEditor />);
    expect(screen.getAllByTestId('pb-row')).toHaveLength(3);
    expect(screen.getByText(/3 voci · versione 2/)).toBeInTheDocument();
    expect(screen.getByTestId('pb-save')).toBeDisabled();
  });

  it('filters by search words and by category without losing the line positions', () => {
    book();
    render(<PriceBookEditor />);
    fireEvent.change(screen.getByTestId('pb-search'), { target: { value: 'piatto' } });
    expect(screen.getAllByTestId('pb-row')).toHaveLength(1);
    // editing the filtered line edits the right line of the FULL list (index 2)
    fireEvent.change(screen.getByTestId('pb-price-2'), { target: { value: '200' } });
    fireEvent.change(screen.getByTestId('pb-search'), { target: { value: '' } });
    expect(screen.getByTestId('pb-price-2')).toHaveValue(200);
    expect(screen.getByTestId('pb-price-1')).toHaveValue(300);

    fireEvent.change(screen.getByLabelText('Filtra per categoria'), { target: { value: 'Demolizioni' } });
    expect(screen.getAllByTestId('pb-row')).toHaveLength(1);
  });

  it('marks edited lines, previews the change and saves with the version it read', () => {
    book();
    render(<PriceBookEditor />);
    fireEvent.change(screen.getByTestId('pb-price-0'), { target: { value: '30' } });
    expect(screen.getAllByTestId('pb-row')[0]).toHaveAttribute('data-mark', 'changed');
    expect(screen.getByTestId('pb-save')).toHaveTextContent('Salva (1)');

    fireEvent.click(screen.getByTestId('pb-save'));
    const counts = screen.getByTestId('save-counts');
    expect(counts).toHaveTextContent('Modificate');
    expect(within(counts).getAllByText('1').length).toBe(1);
    fireEvent.change(screen.getByTestId('save-reason'), { target: { value: 'Prezzi 2026' } });
    fireEvent.click(screen.getByTestId('save-confirm'));

    expect(saveMutation.mutate).toHaveBeenCalledTimes(1);
    const [vars] = saveMutation.mutate.mock.calls[0];
    expect(vars.etag).toBe('"v2"');
    expect(vars.body.reason).toBe('Prezzi 2026');
    expect(vars.body.items[0]).toMatchObject({ sku: 'DEM-001', unit_price: 30 });
    expect(vars.body.items).toHaveLength(3);
  });

  it('refuses to save invalid lines and says which', () => {
    book();
    render(<PriceBookEditor />);
    fireEvent.change(screen.getByTestId('pb-sku-1'), { target: { value: 'DEM-001' } }); // duplicate
    fireEvent.change(screen.getByTestId('pb-price-2'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('pb-save'));
    expect(screen.getByTestId('pb-issues')).toHaveTextContent('2 voci con problemi');
    expect(screen.getByText('SKU duplicato')).toBeInTheDocument();
    expect(screen.queryByTestId('save-confirm')).not.toBeInTheDocument();
    expect(saveMutation.mutate).not.toHaveBeenCalled();
  });

  it('adds a new line on top and removes one', () => {
    book();
    render(<PriceBookEditor />);
    fireEvent.click(screen.getByTestId('pb-add'));
    const rows = screen.getAllByTestId('pb-row');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveAttribute('data-mark', 'new');
    expect(screen.getByTestId('pb-sku-0')).toHaveValue('NUOVO-001');
    expect(screen.getByTestId('pb-details')).toBeInTheDocument(); // opened for editing

    fireEvent.click(screen.getByRole('button', { name: 'Elimina la voce NUOVO-001' }));
    expect(screen.getAllByTestId('pb-row')).toHaveLength(3);
    expect(screen.getByTestId('pb-save')).toBeDisabled(); // back to the saved list: nothing to save
  });

  it('keeps the saved edits on screen, with no false conflict, until the refetched book arrives', () => {
    book();
    saveMutation.mutate.mockImplementation((_vars, options) => options.onSuccess({ version: 3, etag: '"v3"', added: 0, changed: 1, removed: 0 }));
    const { rerender } = render(<PriceBookEditor />);
    fireEvent.change(screen.getByTestId('pb-price-0'), { target: { value: '30' } });
    fireEvent.click(screen.getByTestId('pb-save'));
    fireEvent.click(screen.getByTestId('save-confirm'));
    expect(screen.getByTestId('notice')).toHaveTextContent('versione 3');

    // the server accepted it; the old book ("v2") is still cached while it refetches
    book({}, { isFetching: true });
    rerender(<PriceBookEditor />);
    expect(screen.getByTestId('pb-price-0')).toHaveValue(30);
    expect(screen.queryByTestId('stale-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('pb-save')).toBeDisabled();

    book({ etag: '"v3"', version: 3, items: [item({ unit_price: 30 }), ...ITEMS.slice(1)] });
    rerender(<PriceBookEditor />);
    expect(screen.getByTestId('pb-price-0')).toHaveValue(30);
    expect(screen.queryByTestId('stale-banner')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('pb-row')[0]).not.toHaveAttribute('data-mark');
  });

  it('warns instead of overwriting when someone else saved first', () => {
    book();
    const { rerender } = render(<PriceBookEditor />);
    fireEvent.change(screen.getByTestId('pb-price-0'), { target: { value: '30' } });
    book({ etag: '"v3"', version: 3 });
    rerender(<PriceBookEditor />);
    expect(screen.getByTestId('stale-banner')).toBeInTheDocument();
    expect(screen.getByTestId('pb-save')).toBeDisabled();
  });

  it('tells when a document written by another tool was ignored', () => {
    book({ source: 'seed', version: 0, etag: '"v0"', ignored_document: 'legacy_document' });
    render(<PriceBookEditor />);
    expect(screen.getByTestId('pb-ignored')).toHaveTextContent('senza versione');
  });

  it('shows the rule that stops removing a SKU the AI recipes use', () => {
    book();
    saveMutation.error = new AdminApiError(422, 'PRICE_BOOK_SKU_IN_USE', 'x', { skus: ['DEM-001'] });
    render(<PriceBookEditor />);
    fireEvent.change(screen.getByTestId('pb-price-0'), { target: { value: '30' } });
    fireEvent.click(screen.getByTestId('pb-save'));
    expect(screen.getByTestId('error-banner')).toHaveTextContent('DEM-001');
  });

  it('opens the version history', () => {
    book();
    render(<PriceBookEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Storico/ }));
    expect(screen.getByTestId('pb-history')).toHaveTextContent('Prezzi 2026');
  });

  it('exports the whole list as CSV', () => {
    book();
    const createObjectURL = jest.fn(() => 'blob:x');
    const revoke = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL: revoke });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<PriceBookEditor />);
    fireEvent.click(screen.getByTestId('pb-export'));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:x');
    click.mockRestore();
  });

  it('paginates long lists', () => {
    book({}, {});
    const many = Array.from({ length: 95 }, (_, i) => item({ sku: `X-${String(i).padStart(3, '0')}` }));
    book({ items: many, item_count: many.length });
    render(<PriceBookEditor />);
    expect(screen.getAllByTestId('pb-row')).toHaveLength(40);
    fireEvent.click(screen.getByRole('button', { name: 'Successiva' }));
    fireEvent.click(screen.getByRole('button', { name: 'Successiva' }));
    expect(screen.getAllByTestId('pb-row')).toHaveLength(15);
    expect(screen.getByRole('button', { name: 'Successiva' })).toBeDisabled();
  });
});
