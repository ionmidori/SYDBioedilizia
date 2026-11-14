// Minimal Web Response shim if jsdom lacks global Response
if (typeof globalThis.Response === 'undefined') {
  class MockResponse {
    status: number;
    headers: Headers;
    private readonly bodyText: string;
    constructor(body?: BodyInit | null, init?: ResponseInit) {
      this.status = init?.status ?? 200;
      this.headers = new Headers(init?.headers);
      this.bodyText = typeof body === 'string' ? body : '';
    }
    async text() {
      return this.bodyText;
    }
    async json() {
      return JSON.parse(this.bodyText || '{}');
    }
  }
  globalThis.Response = MockResponse as unknown as typeof Response;
}

jest.mock('@/lib/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { POST } from '../route';

function makeChatRequest(headersInit: Record<string, string> = {}): Request {
  const headers = new Headers({
    Authorization: 'Bearer test-jwt',
    ...headersInit,
  });
  const ac = new AbortController();
  return {
    headers,
    signal: ac.signal,
    json: async () => ({
      sessionId: 'sess-1',
      messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'ciao' }] }],
    }),
  } as unknown as Request;
}

describe('POST /api/chat proxy header forwarding', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('forwards X-Forwarded-For and X-Firebase-AppCheck when present', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      body: 'stream-body',
      headers: { getSetCookie: () => [] },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const req = makeChatRequest({
      'x-forwarded-for': '203.0.113.10, 10.0.0.1',
      'X-Firebase-AppCheck': 'app-check-tok',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const forwardedHeaders = init.headers as Record<string, string>;
    expect(forwardedHeaders.Authorization).toBe('Bearer test-jwt');
    expect(forwardedHeaders['X-Firebase-AppCheck']).toBe('app-check-tok');
    expect(forwardedHeaders['X-Forwarded-For']).toBe('203.0.113.10');
  });

  it('omits X-Forwarded-For when absent', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      body: 'stream-body',
      headers: { getSetCookie: () => [] },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await POST(makeChatRequest());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const forwardedHeaders = init.headers as Record<string, string>;
    expect(forwardedHeaders['X-Forwarded-For']).toBeUndefined();
  });
});
