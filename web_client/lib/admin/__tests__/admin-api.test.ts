import { fetchWithAuth } from '@/lib/api-client';

import { AdminApiError, adminApi } from '../admin-api';

jest.mock('@/lib/api-client', () => ({ fetchWithAuth: jest.fn() }));
const mockFetch = fetchWithAuth as jest.MockedFunction<typeof fetchWithAuth>;

function json(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('adminApi', () => {
  beforeEach(() => mockFetch.mockReset());

  it('builds the inbox query (status, trimmed search, cursor, limit)', async () => {
    mockFetch.mockResolvedValue(json(200, { items: [], next_cursor: null }));
    await adminApi.listQuotes({ status: 'open', q: '  Rossi ' }, 'CUR');
    const url = new URL(mockFetch.mock.calls[0][0], 'http://x');
    expect(url.pathname).toBe('/api/py/admin/quotes');
    expect(Object.fromEntries(url.searchParams)).toEqual({ status: 'open', q: 'Rossi', limit: '25', cursor: 'CUR' });
  });

  it('omits empty filters', async () => {
    mockFetch.mockResolvedValue(json(200, { items: [] }));
    await adminApi.listQuotes({ q: '   ' });
    expect(mockFetch.mock.calls[0][0]).toBe('/api/py/admin/quotes?limit=25');
  });

  it('encodes the project id in the dossier url', async () => {
    mockFetch.mockResolvedValue(json(404, { error_code: 'QUOTE_NOT_FOUND', message: 'nope' }));
    await expect(adminApi.getDossier('a/../b')).rejects.toBeInstanceOf(AdminApiError);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/py/admin/quotes/a%2F..%2Fb');
  });

  it('keeps status and backend error_code on failures', async () => {
    mockFetch.mockResolvedValue(json(403, { error_code: 'ADMIN_REQUIRED', message: 'Admin role required.', detail: {} }));
    const error = await adminApi.me().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdminApiError);
    expect((error as AdminApiError).status).toBe(403);
    expect((error as AdminApiError).errorCode).toBe('ADMIN_REQUIRED');
    expect((error as AdminApiError).isAccessDenied).toBe(true);
  });

  it('survives a non-JSON error body', async () => {
    const htmlError = {
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('html page');
      },
    } as unknown as Response;
    mockFetch.mockResolvedValue(htmlError);
    const error = (await adminApi.me().catch((e: unknown) => e)) as AdminApiError;
    expect(error.errorCode).toBe('HTTP_502');
    expect(error.isAccessDenied).toBe(false);
  });

  it('validates the response shape', async () => {
    mockFetch.mockResolvedValue(json(200, { uid: 'u', role: 'admin', mfa: false, email: 'a@b.it' }));
    await expect(adminApi.me()).resolves.toEqual({ uid: 'u', role: 'admin', mfa: false, email: 'a@b.it' });
  });

  describe('writes', () => {
    const WRITE_OK = { project_id: 'p1', status: 'pending_review', version: 3, etag: '"v3"' };

    it('sends the dossier ETag as If-Match on edit and approve', async () => {
      mockFetch.mockResolvedValue(json(200, WRITE_OK));
      await adminApi.edit('p1', '"v2"', { admin_notes: 'ok' });
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/py/admin/quotes/p1');
      expect(init).toMatchObject({ method: 'PATCH', body: JSON.stringify({ admin_notes: 'ok' }) });
      expect((init as RequestInit).headers).toMatchObject({ 'If-Match': '"v2"', 'Content-Type': 'application/json' });

      await adminApi.approve('p1', '"v3"');
      expect(mockFetch.mock.calls[1][0]).toBe('/api/py/admin/quotes/p1/approve');
      expect((mockFetch.mock.calls[1][1] as RequestInit).headers).toMatchObject({ 'If-Match': '"v3"' });
    });

    it('sends the Idempotency-Key on send', async () => {
      mockFetch.mockResolvedValue(
        json(202, { project_id: 'p1', delivery_id: 'd1', status: 'sent', delivery_status: 'queued' }),
      );
      const result = await adminApi.send('p1', { to: 'a@b.it', cc: [] }, 'key-12345678');
      expect(result.duplicate).toBe(false);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/py/admin/quotes/p1/send');
      expect((init as RequestInit).headers).toMatchObject({ 'Idempotency-Key': 'key-12345678' });
    });

    it('posts the reason for reject and reopen', async () => {
      mockFetch.mockResolvedValue(json(200, { ...WRITE_OK, status: 'rejected' }));
      await adminApi.reject('p1', 'Fuori zona');
      expect(mockFetch.mock.calls[0][0]).toBe('/api/py/admin/quotes/p1/reject');
      expect((mockFetch.mock.calls[0][1] as RequestInit).body).toBe(JSON.stringify({ reason: 'Fuori zona' }));
      await adminApi.reopen('p1', 'Cliente ha richiamato');
      expect(mockFetch.mock.calls[1][0]).toBe('/api/py/admin/quotes/p1/reopen');
    });

    it('asks for an attachment URL with a readable filename', async () => {
      mockFetch.mockResolvedValue(json(200, { url: 'https://signed.test/x', filename: 'PRV-2026-0001_foto-1.jpg' }));
      const media = await adminApi.getMediaUrl('p1', 'm/1', 'attachment');
      expect(mockFetch.mock.calls[0][0]).toBe('/api/py/admin/quotes/p1/media/m%2F1/url?disposition=attachment');
      expect(media.filename).toBe('PRV-2026-0001_foto-1.jpg');
    });

    it('surfaces a version conflict with its code', async () => {
      mockFetch.mockResolvedValue(json(409, { error_code: 'VERSION_CONFLICT', message: 'changed' }));
      const error = (await adminApi.edit('p1', '"v1"', {}).catch((e: unknown) => e)) as AdminApiError;
      expect(error.status).toBe(409);
      expect(error.errorCode).toBe('VERSION_CONFLICT');
    });
  });

  describe('dashboard and price book', () => {
    it('reads the KPIs', async () => {
      mockFetch.mockResolvedValue(
        json(200, {
          by_status: { pending_review: 2 },
          pending_value: 10,
          weekly_approvals: [],
          recent_approvals: [],
          testimonials: {},
          generated_at: '2026-10-14T12:00:00Z',
        }),
      );
      const kpis = await adminApi.getKpis();
      expect(mockFetch.mock.calls[0][0]).toBe('/api/py/admin/kpis');
      expect(kpis.by_status.pending_review).toBe(2);
    });

    it('saves the price book with the ETag it read as If-Match', async () => {
      mockFetch.mockResolvedValue(json(200, { etag: '"v3"', version: 3, item_count: 1, added: 0, removed: 0, changed: 1 }));
      const item = { sku: 'A-1', description: 'd', unit: 'mq', unit_price: 1, category: 'c', vat_agevolata: false, tags: [] };
      await adminApi.savePriceBook('"v2"', { items: [item], reason: 'Prezzi 2026' });
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/py/admin/price-book');
      expect(init).toMatchObject({ method: 'PUT' });
      expect((init as RequestInit).headers).toMatchObject({ 'If-Match': '"v2"' });
      expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ reason: 'Prezzi 2026' });
    });

    it('keeps the list of SKUs when the AI recipes still use them', async () => {
      mockFetch.mockResolvedValue(json(422, { error_code: 'PRICE_BOOK_SKU_IN_USE', message: 'x', detail: { skus: ['DEM-001'] } }));
      const error = (await adminApi.savePriceBook('"v1"', { items: [] } as never).catch((e: unknown) => e)) as AdminApiError;
      expect(error.errorCode).toBe('PRICE_BOOK_SKU_IN_USE');
      expect(error.detail).toEqual({ skus: ['DEM-001'] });
    });
  });

  describe('batches, content and GDPR', () => {
    const PROJECT = { id: 'p1', title: 'Bagno', category: 'Bagno', location: 'Roma', stats: {}, active: true, order: 1 };

    it('reads batches by scope and one batch by id', async () => {
      mockFetch.mockResolvedValue(json(200, { items: [] }));
      await adminApi.listBatches('closed');
      expect(mockFetch.mock.calls[0][0]).toBe('/api/py/admin/batches?scope=closed');
      mockFetch.mockResolvedValue(json(200, { batch_id: 'b/1', status: 'submitted', projects: [] }));
      await adminApi.getBatch('b/1');
      expect(mockFetch.mock.calls[1][0]).toBe('/api/py/admin/batches/b%2F1');
    });

    it('moderates a testimonial with the decision and the note', async () => {
      mockFetch.mockResolvedValue(json(200, { id: 't1', status: 'approved', stats: {} }));
      await adminApi.listTestimonials('pending').catch(() => undefined);
      expect(mockFetch.mock.calls[0][0]).toBe('/api/py/admin/testimonials?status=pending');
      await adminApi.moderateTestimonial('t1', { decision: 'approve', notes: 'ok' });
      const [url, init] = mockFetch.mock.calls[1];
      expect(url).toBe('/api/py/admin/testimonials/t1/moderate');
      expect(JSON.parse(String((init as RequestInit).body))).toEqual({ decision: 'approve', notes: 'ok' });
    });

    it('creates, patches and deletes portfolio projects', async () => {
      mockFetch.mockResolvedValue(json(200, PROJECT));
      await adminApi.updatePortfolioProject('p/1', { active: false });
      expect(mockFetch.mock.calls[0][0]).toBe('/api/py/admin/portfolio/p%2F1');
      expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ active: false }) });

      // a successful delete answers 204 with no body
      mockFetch.mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('no body'); } } as unknown as Response);
      await expect(adminApi.deletePortfolioProject('p1')).resolves.toBeUndefined();
      expect(mockFetch.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });

      mockFetch.mockResolvedValue(json(404, { error_code: 'RESOURCE_NOT_FOUND', message: 'gone' }));
      await expect(adminApi.deletePortfolioProject('p1')).rejects.toMatchObject({ status: 404 });
    });

    it('uploads an image as multipart without forcing a Content-Type', async () => {
      mockFetch.mockResolvedValue(json(201, { image_url: 'https://x/portfolio%2Fa.webp', width: 10, height: 10, size_bytes: 5 }));
      const file = new File(['x'], 'foto.png', { type: 'image/png' });
      const result = await adminApi.uploadPortfolioImage(file);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/py/admin/portfolio/image');
      expect((init as RequestInit).body).toBeInstanceOf(FormData);
      expect(((init as RequestInit).body as FormData).get('file')).toBeInstanceOf(File);
      expect((init as RequestInit).headers).toBeUndefined(); // the browser sets the multipart boundary
      expect(result.image_url).toContain('portfolio');
    });

    it('runs the GDPR pass and keeps the already-running code', async () => {
      mockFetch.mockResolvedValue(json(200, { status: 'ok', warned: 1, disabled: 0, anonymized: 0, errors: [] }));
      await expect(adminApi.runGdprLifecycle()).resolves.toMatchObject({ warned: 1 });
      expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST' });
      mockFetch.mockResolvedValue(json(409, { error_code: 'LIFECYCLE_ALREADY_RUNNING', message: 'busy' }));
      await expect(adminApi.runGdprLifecycle()).rejects.toMatchObject({ errorCode: 'LIFECYCLE_ALREADY_RUNNING' });
    });
  });

  it("uses FastAPI's string detail as the message (uploads answer 400/413 that way)", async () => {
    mockFetch.mockResolvedValue(json(413, { detail: 'File too large. Maximum size is 10MB.' }));
    const error = (await adminApi.uploadPortfolioImage(new File(['x'], 'a.png', { type: 'image/png' })).catch((e: unknown) => e)) as AdminApiError;
    expect(error.status).toBe(413);
    expect(error.message).toBe('File too large. Maximum size is 10MB.');
  });
});
