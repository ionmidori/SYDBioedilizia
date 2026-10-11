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
});
