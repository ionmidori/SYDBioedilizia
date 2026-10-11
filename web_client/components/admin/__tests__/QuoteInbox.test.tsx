import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { QuoteInbox } from '../QuoteInbox';
import { useAdminQuotes } from '@/hooks/admin/use-admin';
import type { AdminQuoteListItem } from '@/types/admin-quote';

jest.mock('@/hooks/admin/use-admin');
const mockQuotes = useAdminQuotes as jest.MockedFunction<typeof useAdminQuotes>;

function row(overrides: Partial<AdminQuoteListItem> = {}): AdminQuoteListItem {
  return {
    project_id: 'p1',
    quote_number: 'PRV-2026-0001',
    client_display_name: 'Mario Rossi',
    client_email: 'mario@example.it',
    client_is_guest: false,
    status: 'pending_review',
    delivery_status: 'none',
    grand_total: 816.91,
    item_count: 2,
    channel: 'chat',
    summary: 'Pittura cucina',
    thumbnail_media_id: 'f1',
    locked_by: null,
    created_at: '2026-10-10T14:26:00Z',
    updated_at: '2026-10-10T14:46:00Z',
    ...overrides,
  };
}

function result(items: AdminQuoteListItem[], extra: Record<string, unknown> = {}) {
  mockQuotes.mockReturnValue({
    isPending: false,
    isError: false,
    data: { pages: [{ items, next_cursor: null }], pageParams: [null] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    ...extra,
  } as unknown as ReturnType<typeof useAdminQuotes>);
}

describe('QuoteInbox', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows who asked, for what and how much — never a raw id as title', () => {
    result([row()]);
    render(<QuoteInbox />);
    const item = screen.getByTestId('inbox-row');
    expect(within(item).getByTestId('inbox-number')).toHaveTextContent('PRV-2026-0001');
    expect(within(item).getByTestId('inbox-client')).toHaveTextContent('Mario Rossi');
    expect(item).toHaveTextContent('mario@example.it');
    expect(item).toHaveTextContent('Pittura cucina');
    expect(item).toHaveTextContent('816,91');
    expect(within(item).getByTestId('inbox-status')).toHaveTextContent('Da revisionare');
    expect(within(item).getByRole('link')).toHaveAttribute('href', '/admin/quotes/p1');
  });

  it('labels guests and quotes without data clearly', () => {
    result([row({ client_display_name: null, client_email: null, client_is_guest: true, quote_number: null })]);
    render(<QuoteInbox />);
    expect(screen.getByTestId('inbox-client')).toHaveTextContent('Cliente ospite');
    expect(screen.getByTestId('inbox-number')).toHaveTextContent('Senza numero');
  });

  it('shows delivery problems next to the status', () => {
    result([row({ status: 'sent', delivery_status: 'bounced' })]);
    render(<QuoteInbox />);
    expect(screen.getByTestId('inbox-row')).toHaveTextContent('Email rimbalzata');
  });

  it('starts on the open quotes and switches filter by tab', () => {
    result([]);
    render(<QuoteInbox />);
    expect(mockQuotes).toHaveBeenLastCalledWith({ status: 'open', q: undefined });
    fireEvent.click(screen.getByRole('tab', { name: 'Inviati' }));
    expect(mockQuotes).toHaveBeenLastCalledWith({ status: 'sent', q: undefined });
    fireEvent.click(screen.getByRole('tab', { name: 'Tutti' }));
    expect(mockQuotes).toHaveBeenLastCalledWith({ status: undefined, q: undefined });
  });

  it('searches on submit, not on every keystroke', () => {
    result([]);
    render(<QuoteInbox />);
    const input = screen.getByLabelText('Cerca per numero, nome o email');
    fireEvent.change(input, { target: { value: ' PRV-2026-0001 ' } });
    expect(mockQuotes).toHaveBeenLastCalledWith({ status: 'open', q: undefined });
    fireEvent.submit(screen.getByRole('search'));
    expect(mockQuotes).toHaveBeenLastCalledWith({ status: 'open', q: 'PRV-2026-0001' });
    expect(screen.getByTestId('inbox-empty')).toHaveTextContent('PRV-2026-0001');
  });

  it('loads more pages on demand', () => {
    const fetchNextPage = jest.fn();
    result([row()], { hasNextPage: true, fetchNextPage });
    render(<QuoteInbox />);
    fireEvent.click(screen.getByRole('button', { name: 'Carica altri' }));
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('reports a loading error', () => {
    mockQuotes.mockReturnValue({ isPending: false, isError: true } as unknown as ReturnType<typeof useAdminQuotes>);
    render(<QuoteInbox />);
    expect(screen.getByRole('alert')).toHaveTextContent('Impossibile caricare');
  });
});
