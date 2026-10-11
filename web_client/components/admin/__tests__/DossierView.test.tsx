import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { DossierView } from '../DossierView';
import * as hooks from '@/hooks/admin/use-admin';
import type { QuoteDossier } from '@/types/admin-quote';

jest.mock('@/hooks/admin/use-admin');
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const m = hooks as jest.Mocked<typeof hooks>;

function mutation(overrides: Record<string, unknown> = {}) {
  return { mutate: jest.fn(), isPending: false, error: null, reset: jest.fn(), ...overrides };
}

function dossier(overrides: Record<string, unknown> = {}, quote: Record<string, unknown> = {}): QuoteDossier {
  return {
    project_id: 'p1',
    project_name: 'Bagno Trastevere',
    etag: '"v2"',
    client_live: null,
    client_profile_changed: false,
    media: [],
    revisions: [{ version: 2, actor_kind: 'ai', created_at: '2026-10-10T14:26:00Z', change_count: 0 }],
    deliveries: [],
    quote: {
      doc_type: 'quote',
      project_id: 'p1',
      user_id: 'u1',
      quote_number: 'PRV-2026-0001',
      status: 'pending_review',
      delivery_status: 'none',
      version: 2,
      items: [
        { sku: 'PIT-001', description: 'Pittura pareti', unit: 'mq', qty: 10, unit_price: 12.5, total: 125, manual_override: false },
      ],
      financials: { subtotal: 125, vat_rate: 0.22, vat_amount: 27.5, grand_total: 152.5 },
      media: [],
      search_keys: [],
      admin_notes: null,
      request: { summary: 'Ridipingere il bagno di 6 mq', address: 'Via Roma 1, Roma', channel: 'chat' },
      client_snapshot: { uid: 'u1', display_name: 'Mario Rossi', email: 'mario@example.it', is_guest: false },
      review: null,
      created_at: '2026-10-10T14:26:00Z',
      ...quote,
    },
    ...overrides,
  } as QuoteDossier;
}

const mocks = {
  claim: mutation(),
  release: mutation(),
  edit: mutation(),
  approve: mutation(),
  reject: mutation(),
  reopen: mutation(),
  regenerate: mutation(),
};

function setup(data: QuoteDossier, meUid = 'admin-1') {
  m.useAdminDossier.mockReturnValue({ isPending: false, isError: false, data, refetch: jest.fn() } as unknown as ReturnType<
    typeof m.useAdminDossier
  >);
  m.useNow.mockReturnValue(Date.now());
  m.useAdminMe.mockReturnValue({ data: { uid: meUid } } as unknown as ReturnType<typeof m.useAdminMe>);
  m.useClaimQuote.mockReturnValue(mocks.claim as unknown as ReturnType<typeof m.useClaimQuote>);
  m.useReleaseQuote.mockReturnValue(mocks.release as unknown as ReturnType<typeof m.useReleaseQuote>);
  m.useEditQuote.mockReturnValue(mocks.edit as unknown as ReturnType<typeof m.useEditQuote>);
  m.useApproveQuote.mockReturnValue(mocks.approve as unknown as ReturnType<typeof m.useApproveQuote>);
  m.useRejectQuote.mockReturnValue(mocks.reject as unknown as ReturnType<typeof m.useRejectQuote>);
  m.useReopenQuote.mockReturnValue(mocks.reopen as unknown as ReturnType<typeof m.useReopenQuote>);
  m.useRegeneratePdf.mockReturnValue(mocks.regenerate as unknown as ReturnType<typeof m.useRegeneratePdf>);
  m.useSendDefaults.mockReturnValue({ isPending: true, isError: false } as unknown as ReturnType<typeof m.useSendDefaults>);
  return render(<DossierView projectId="p1" />);
}

describe('DossierView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mocks).forEach((mock) => Object.assign(mock, mutation()));
  });

  it('opens with who, what and how much — never a raw id', () => {
    setup(dossier());
    expect(screen.getByTestId('dossier-number')).toHaveTextContent('PRV-2026-0001');
    expect(screen.getByTestId('dossier-client')).toHaveTextContent('Mario Rossi');
    expect(screen.getByTestId('dossier-status')).toHaveTextContent('Da revisionare');
    expect(screen.getByTestId('request-summary')).toHaveTextContent('Ridipingere il bagno di 6 mq');
    expect(screen.getByTestId('client-card')).toHaveTextContent('mario@example.it');
    expect(screen.getByTestId('dossier-total')).toHaveTextContent('152,50');
    expect(screen.getByTestId('gallery-empty')).toBeInTheDocument();
  });

  it('keeps Approve off while edits are unsaved, then saves only what changed with the ETag', () => {
    setup(dossier());
    expect(screen.getByTestId('btn-approve')).toBeEnabled();

    fireEvent.change(screen.getByTestId('item-qty-0'), { target: { value: '20' } });
    // live totals: 20 x 12.50 = 250 + 22% VAT
    expect(screen.getByTestId('totals-grand')).toHaveTextContent('305,00');
    expect(screen.getByTestId('btn-approve')).toBeDisabled();

    fireEvent.click(screen.getByTestId('btn-save'));
    expect(mocks.edit.mutate).toHaveBeenCalledTimes(1);
    const [vars] = mocks.edit.mutate.mock.calls[0];
    expect(vars.etag).toBe('"v2"');
    expect(Object.keys(vars.body)).toEqual(['items']);
    expect(vars.body.items[0]).toMatchObject({ sku: 'PIT-001', qty: 20, total: 250 });
  });

  it('refuses to save invalid lines and says which', () => {
    setup(dossier());
    fireEvent.change(screen.getByTestId('item-qty-0'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('btn-save'));
    expect(mocks.edit.mutate).not.toHaveBeenCalled();
    expect(screen.getByText('Quantità non valida')).toBeInTheDocument();
  });

  it('approves the version on screen after confirmation', () => {
    setup(dossier());
    fireEvent.click(screen.getByTestId('btn-approve'));
    const summary = screen.getByTestId('approve-summary');
    expect(within(summary).getByText('PRV-2026-0001')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('approve-confirm'));
    expect(mocks.approve.mutate).toHaveBeenCalledWith('"v2"', expect.any(Object));
  });

  it('does not let a newer version overwrite unsaved work: warns and blocks saving', () => {
    const { rerender } = setup(dossier());
    fireEvent.change(screen.getByTestId('item-qty-0'), { target: { value: '20' } });
    // another admin saved meanwhile: the dossier now carries a newer ETag
    m.useAdminDossier.mockReturnValue({
      isPending: false,
      isError: false,
      data: dossier({ etag: '"v3"' }, { version: 3 }),
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof m.useAdminDossier>);
    rerender(<DossierView projectId="p1" />);
    expect(screen.getByTestId('stale-banner')).toBeInTheDocument();
    expect(screen.getByTestId('btn-save')).toBeDisabled();
  });

  it('is read-only while another admin holds the review lock', () => {
    setup(dossier({}, { status: 'in_review', review: { locked_by: 'admin-2', locked_at: new Date().toISOString() } }));
    expect(screen.getByTestId('locked-banner')).toBeInTheDocument();
    expect(screen.getByTestId('item-qty-0')).toBeDisabled();
    expect(screen.queryByTestId('btn-approve')).not.toBeInTheDocument();
  });

  it('ignores an expired lock', () => {
    const old = new Date(Date.now() - 31 * 60_000).toISOString();
    setup(dossier({}, { status: 'in_review', review: { locked_by: 'admin-2', locked_at: old } }));
    expect(screen.queryByTestId('locked-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('item-qty-0')).toBeEnabled();
  });

  it('after approval offers to send, not to edit; sending needs the PDF', () => {
    setup(
      dossier(
        {},
        {
          status: 'approved',
          pdf_blob_path: 'projects/p1/quotes/PRV-2026-0001_r2.pdf',
          pdf_revision: 2,
          review: { approved_revision: 2 },
        },
      ),
    );
    expect(screen.getByTestId('btn-send')).toBeEnabled();
    expect(screen.getByTestId('btn-reopen')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-approve')).not.toBeInTheDocument();
    expect(screen.getByTestId('item-qty-0')).toBeDisabled();
  });

  it('flags an approved quote whose PDF is missing and disables sending', () => {
    setup(dossier({}, { status: 'approved', review: { approved_revision: 2 } }));
    expect(screen.getByTestId('pdf-missing')).toBeInTheDocument();
    expect(screen.getByTestId('btn-send')).toBeDisabled();
  });

  it('shows the live profile when it differs from the saved snapshot', () => {
    setup(
      dossier({
        client_profile_changed: true,
        client_live: { display_name: 'Mario Bianchi', email: 'nuova@example.it', phone: null },
      }),
    );
    expect(screen.getByTestId('profile-changed')).toHaveTextContent('nuova@example.it');
  });

  it('adds a line from the price book with the official sku and price, and the draft is then savable', () => {
    setup(dossier());
    m.usePriceBook.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        items: [{ sku: 'DEM-001', description: 'Demolizione tramezzi', unit: 'mq', unit_price: 25, category: 'Demolizioni', vat_agevolata: false, tags: [] }],
      },
    } as unknown as ReturnType<typeof m.usePriceBook>);
    fireEvent.click(screen.getByTestId('add-from-price-book'));
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi DEM-001' }));

    expect(screen.getAllByTestId('items-row')).toHaveLength(2);
    expect(screen.getByTestId('item-price-1')).toHaveValue(25);
    expect(screen.getByTestId('btn-save')).toBeEnabled();
    expect(screen.getByTestId('btn-approve')).toBeDisabled(); // unsaved: save first
    // 10 x 12.50 + 1 x 25 = 150 + 22% VAT
    expect(screen.getByTestId('totals-grand')).toHaveTextContent('183,00');
  });

  it('offers no price book search once the quote is no longer editable', () => {
    setup(dossier({}, { status: 'approved' }));
    expect(screen.queryByTestId('add-from-price-book')).not.toBeInTheDocument();
  });

  describe('right after a save', () => {
    function withDossier(data: QuoteDossier, isFetching: boolean) {
      m.useAdminDossier.mockReturnValue({
        isPending: false,
        isError: false,
        isFetching,
        data,
        refetch: jest.fn(),
      } as unknown as ReturnType<typeof m.useAdminDossier>);
    }

    it('keeps the saved edits on screen, with no false conflict, until the refetched dossier arrives', () => {
      const { rerender } = setup(dossier());
      mocks.edit.mutate.mockImplementation((_vars, options) => options.onSuccess({ version: 3, etag: '"v3"' }));

      fireEvent.change(screen.getByTestId('item-qty-0'), { target: { value: '20' } });
      fireEvent.click(screen.getByTestId('btn-save'));

      // the server accepted the edit, the old dossier ("v2") is still in the cache while it refetches
      withDossier(dossier(), true);
      rerender(<DossierView projectId="p1" />);
      expect(screen.getByTestId('item-qty-0')).toHaveValue(20);
      expect(screen.queryByTestId('stale-banner')).not.toBeInTheDocument();
      expect(screen.getByTestId('btn-approve')).toBeDisabled();

      // the refetch lands with the new ETag and the saved values
      const saved = dossier({ etag: '"v3"' }, { version: 3 });
      saved.quote.items = [{ ...saved.quote.items[0], qty: 20, total: 250 }];
      withDossier(saved, false);
      rerender(<DossierView projectId="p1" />);
      expect(screen.getByTestId('item-qty-0')).toHaveValue(20);
      expect(screen.queryByTestId('stale-banner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('btn-save')).not.toBeInTheDocument();
      expect(screen.getByTestId('btn-approve')).toBeEnabled();

      // typing again starts from the NEW version, not the one before the save
      fireEvent.change(screen.getByTestId('item-qty-0'), { target: { value: '25' } });
      fireEvent.click(screen.getByTestId('btn-save'));
      expect(mocks.edit.mutate.mock.calls[1][0].etag).toBe('"v3"');
    });

    it('does not show unsaved edits once the quote is no longer editable', () => {
      const { rerender } = setup(dossier());
      fireEvent.change(screen.getByTestId('item-qty-0'), { target: { value: '99' } });

      // rejected meanwhile (same ETag): the read-only view shows the saved version
      withDossier(dossier({}, { status: 'rejected' }), false);
      rerender(<DossierView projectId="p1" />);
      expect(screen.getByTestId('item-qty-0')).toHaveValue(10);
      expect(screen.getByTestId('dossier-total')).toHaveTextContent('152,50');
      expect(screen.queryByTestId('btn-discard')).not.toBeInTheDocument();
    });
  });
});
