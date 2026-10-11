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
});
