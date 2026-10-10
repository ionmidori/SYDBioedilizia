/**
 * Golden Sync guard for the admin quote API (Phase 128 PR 3.1): payloads shaped
 * exactly like backend_python/src/schemas/admin_quote.py output must parse.
 */
import {
  adminQuoteListSchema,
  editQuoteBodySchema,
  quoteDossierSchema,
  quoteWriteResponseSchema,
} from '../admin-quote';

const dossier = {
  project_id: '9de20502-0eb6-4075-99f1-14ad188150af',
  project_name: 'Cucina',
  etag: '"v3"',
  quote: {
    id: 'quote',
    doc_type: 'quote',
    project_id: '9de20502-0eb6-4075-99f1-14ad188150af',
    user_id: 'uid-1',
    quote_number: 'PRV-2026-0001',
    quote_year: 2026,
    quote_seq: 1,
    status: 'in_review',
    delivery_status: 'none',
    items: [
      {
        sku: 'PIT-001',
        description: 'Tinteggiatura',
        unit: 'mq',
        qty: 40.7,
        unit_price: 12,
        total: 488.4,
        ai_reasoning: null,
        category: 'Tinteggiature',
        manual_override: false,
      },
    ],
    financials: { subtotal: 488.4, vat_rate: 0.22, vat_amount: 107.45, grand_total: 595.85 },
    admin_notes: null,
    request: { summary: 'Pittura cucina', channel: 'chat', session_id: '9de2' },
    client_snapshot: {
      uid: 'uid-1',
      display_name: 'Mario Rossi',
      email: 'm@x.it',
      phone: null,
      is_guest: false,
      captured_at: '2026-10-10T14:26:00Z',
    },
    media: [
      { media_id: 'a1b2', kind: 'input_photo', blob_path: 'user-uploads/9de2/a.jpg', label: 'Foto 1' },
    ],
    search_keys: ['prv-2026-0001', 'mario', 'rossi'],
    review: { locked_by: 'admin-a', locked_at: '2026-10-11T09:00:00Z' },
    created_at: '2026-10-10T14:26:00Z',
    updated_at: '2026-10-11T09:00:00Z',
    version: 3,
    pdf_url: null,
    pdf_blob_path: null,
    pdf_revision: null,
  },
  client_live: { display_name: 'Mario Rossi', email: 'm@x.it', phone: null },
  client_profile_changed: false,
  media: [
    {
      media_id: 'a1b2',
      kind: 'input_photo',
      blob_path: 'user-uploads/9de2/a.jpg',
      label: 'Foto 1',
      url: 'https://storage.googleapis.com/signed',
    },
  ],
  revisions: [
    { version: 3, actor_kind: 'admin', actor_uid: 'admin-a', reason: 'sopralluogo', change_count: 2 },
  ],
};

describe('admin quote Golden Sync', () => {
  it('parses a dossier as produced by the backend', () => {
    const parsed = quoteDossierSchema.parse(dossier);
    expect(parsed.quote.quote_number).toBe('PRV-2026-0001');
    expect(parsed.quote.client_snapshot?.display_name).toBe('Mario Rossi');
    expect(parsed.media[0].url).toContain('signed');
  });

  it('parses an inbox page', () => {
    const page = adminQuoteListSchema.parse({
      items: [
        {
          project_id: 'p1',
          quote_number: 'PRV-2026-0001',
          client_display_name: 'Mario Rossi',
          status: 'pending_review',
          grand_total: 816.91,
          item_count: 2,
          summary: 'Pittura cucina',
        },
      ],
      next_cursor: null,
    });
    expect(page.items[0].delivery_status).toBe('none');
  });

  it('parses a write response', () => {
    const res = quoteWriteResponseSchema.parse({
      project_id: 'p1',
      status: 'approved',
      version: 3,
      etag: '"v3"',
      pdf_ready: true,
    });
    expect(res.pdf_ready).toBe(true);
  });

  it('rejects unknown fields in an edit, like the backend (extra=forbid)', () => {
    expect(editQuoteBodySchema.safeParse({ status: 'approved' }).success).toBe(false);
    expect(editQuoteBodySchema.safeParse({ admin_notes: 'ok' }).success).toBe(true);
  });
});
