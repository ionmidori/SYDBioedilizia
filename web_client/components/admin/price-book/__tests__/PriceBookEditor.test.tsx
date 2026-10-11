import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { PriceBookEditor } from '../PriceBookEditor';
import { optionalNum } from '../PriceBookRow';
import { usePriceBook, usePriceBookHistory, useSavePriceBook } from '@/hooks/admin/use-admin';
import { AdminApiError } from '@/lib/admin/admin-api';
import { confirmLeave, LEAVE_MESSAGE } from '@/lib/admin/unsaved-guard';
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

  it('exports the SAVED list under its version number, even when there are unsaved edits', () => {
    jest.useFakeTimers();
    book();
    const blobs: Blob[] = [];
    const createObjectURL = jest.fn((blob: Blob) => (blobs.push(blob), 'blob:x'));
    const revoke = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL: revoke });
    let downloadName = '';
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadName = this.download;
      });
    render(<PriceBookEditor />);
    fireEvent.change(screen.getByTestId('pb-price-0'), { target: { value: '999' } });
    fireEvent.click(screen.getByTestId('pb-export'));

    expect(downloadName).toBe('listino-syd-v2.csv');
    expect(revoke).not.toHaveBeenCalled(); // the browser may still be starting the download
    jest.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:x');
    expect(blobs).toHaveLength(1);
    click.mockRestore();
    jest.useRealTimers();
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

  it('an edit typed right after a save builds on the saved version: no false conflict when the refetch lands', () => {
    book();
    saveMutation.mutate.mockImplementation((_vars, options) => options.onSuccess({ version: 3, etag: '"v3"', added: 0, changed: 1, removed: 0 }));
    const { rerender } = render(<PriceBookEditor />);
    fireEvent.change(screen.getByTestId('pb-price-0'), { target: { value: '30' } });
    fireEvent.click(screen.getByTestId('pb-save'));
    fireEvent.click(screen.getByTestId('save-confirm'));

    // the refetch is not "in flight" yet (e.g. just before it starts) and the admin keeps typing
    fireEvent.change(screen.getByTestId('pb-price-1'), { target: { value: '310' } });
    book({ etag: '"v3"', version: 3, items: [item({ unit_price: 30 }), ...ITEMS.slice(1)] });
    rerender(<PriceBookEditor />);

    expect(screen.queryByTestId('stale-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('pb-price-1')).toHaveValue(310);
    expect(screen.getByTestId('pb-save')).toBeEnabled();
  });

  it('cannot be edited while a save is settling', () => {
    book();
    saveMutation.mutate.mockImplementation((_vars, options) => options.onSuccess({ version: 3, etag: '"v3"', added: 0, changed: 1, removed: 0 }));
    const { rerender } = render(<PriceBookEditor />);
    fireEvent.change(screen.getByTestId('pb-price-0'), { target: { value: '30' } });
    fireEvent.click(screen.getByTestId('pb-save'));
    fireEvent.click(screen.getByTestId('save-confirm'));
    book({}, { isFetching: true });
    rerender(<PriceBookEditor />);
    expect(screen.getByRole('group', { name: 'Voci del listino' })).toBeDisabled();
    expect(screen.getByTestId('pb-add')).toBeDisabled();
  });

  describe('finding the line that blocks a save', () => {
    const many = Array.from({ length: 95 }, (_, i) => item({ sku: `X-${String(i).padStart(3, '0')}`, description: `Voce ${i}` }));

    it('clears the filters, goes to the right page and focuses the bad field', () => {
      book({ items: many, item_count: many.length });
      render(<PriceBookEditor />);
      fireEvent.change(screen.getByTestId('pb-search'), { target: { value: 'Voce 7' } }); // a filter hides the rest
      fireEvent.change(screen.getByTestId('pb-price-7'), { target: { value: '1' } }); // some edit, so Save is enabled
      fireEvent.change(screen.getByTestId('pb-search'), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Successiva' }));
      fireEvent.click(screen.getByRole('button', { name: 'Successiva' })); // page 3 (rows 80-94)
      fireEvent.change(screen.getByTestId('pb-price-85'), { target: { value: '' } }); // invalid
      fireEvent.change(screen.getByTestId('pb-search'), { target: { value: 'Voce 7' } });
      fireEvent.click(screen.getByTestId('pb-save'));

      expect(screen.getByTestId('pb-search')).toHaveValue(''); // filter cleared
      expect(screen.getByTestId('pb-issues')).toHaveTextContent('1 voci con problemi');
      expect(document.activeElement).toBe(screen.getByTestId('pb-price-85')); // page 3 shown, field focused
    });

    it('opens the details when the problem is there, and hints at it while they are closed', () => {
      book({ items: many.slice(0, 5), item_count: 5 });
      render(<PriceBookEditor />);
      fireEvent.click(screen.getByRole('button', { name: 'Dettagli della voce X-002' }));
      const details = screen.getByTestId('pb-details');
      fireEvent.change(within(details).getByLabelText('Quantità min'), { target: { value: '-5' } });
      fireEvent.click(screen.getByRole('button', { name: 'Dettagli della voce X-002' })); // close it again
      fireEvent.click(screen.getByTestId('pb-save'));

      // the failed save re-opens the row where the error is
      expect(screen.getByTestId('pb-details')).toBeInTheDocument();
      expect(within(screen.getByTestId('pb-details')).getByText('Quantità minima non valida')).toBeInTheDocument();
    });

    it('the banner can take you to the first problem again', () => {
      book({ items: many.slice(0, 5), item_count: 5 });
      render(<PriceBookEditor />);
      fireEvent.change(screen.getByTestId('pb-price-3'), { target: { value: '' } });
      fireEvent.click(screen.getByTestId('pb-save'));
      fireEvent.change(screen.getByTestId('pb-search'), { target: { value: 'Voce 0' } });
      fireEvent.click(screen.getByTestId('pb-jump'));
      expect(screen.getByTestId('pb-search')).toHaveValue('');
      expect(document.activeElement).toBe(screen.getByTestId('pb-price-3'));
    });
  });

  it('asks before leaving with unsaved edits, and stops asking once they are discarded', () => {
    book();
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<PriceBookEditor />);
    expect(confirmLeave()).toBe(true); // nothing edited yet
    fireEvent.change(screen.getByTestId('pb-price-0'), { target: { value: '30' } });
    expect(confirmLeave()).toBe(false);
    expect(confirm).toHaveBeenCalledWith(LEAVE_MESSAGE);

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByTestId('pb-discard'));
    expect(confirmLeave()).toBe(true);
    confirm.mockRestore();
  });

  it('moves focus to the new line, and back to the Add button after a removal', () => {
    book();
    render(<PriceBookEditor />);
    fireEvent.click(screen.getByTestId('pb-add'));
    expect(document.activeElement).toBe(screen.getByTestId('pb-sku-0'));
    fireEvent.click(screen.getByRole('button', { name: 'Elimina la voce NUOVO-001' }));
    expect(document.activeElement).toBe(screen.getByTestId('pb-add'));
  });
});

describe('optionalNum', () => {
  const el = (value: string, badInput = false) => ({ value, validity: { badInput } }) as unknown as HTMLInputElement;

  it('empty = absent, text the browser cannot read = NaN (flagged), never silently dropped', () => {
    expect(optionalNum(el(''))).toBeNull();
    expect(optionalNum(el('12.5'))).toBe(12.5);
    expect(Number.isNaN(optionalNum(el('', true)))).toBe(true);
  });
});
