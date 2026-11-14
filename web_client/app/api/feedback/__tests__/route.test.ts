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
  }
  globalThis.Response = MockResponse as unknown as typeof Response;
}

import { POST } from '../route';

function makeFeedbackRequest(headersInit: Record<string, string> = {}): Request {
  const headers = new Headers({
    Authorization: 'Bearer test-jwt',
    ...headersInit,
  });
  return {
    headers,
    json: async () => ({ session_id: 's1', message_id: 'm1', rating: 'positive' }),
  } as unknown as Request;
}

describe('POST /api/feedback proxy header forwarding', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('forwards X-Forwarded-For and X-Firebase-AppCheck when present', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      text: async () => '{"ok":true}',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await POST(
      makeFeedbackRequest({
        'x-forwarded-for': '198.51.100.42',
        'X-Firebase-AppCheck': 'app-check-tok',
        'Idempotency-Key': 'idem-fb-123',
      }),
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const forwardedHeaders = init.headers as Record<string, string>;
    expect(forwardedHeaders.Authorization).toBe('Bearer test-jwt');
    expect(forwardedHeaders['X-Firebase-AppCheck']).toBe('app-check-tok');
    expect(forwardedHeaders['X-Forwarded-For']).toBe('198.51.100.42');
    expect(forwardedHeaders['Idempotency-Key']).toBe('idem-fb-123');
  });

  it('omits X-Forwarded-For, X-Firebase-AppCheck, and Idempotency-Key when absent', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      text: async () => '{"ok":true}',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await POST(makeFeedbackRequest());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const forwardedHeaders = init.headers as Record<string, string>;
    expect(forwardedHeaders['X-Forwarded-For']).toBeUndefined();
    expect(forwardedHeaders['X-Firebase-AppCheck']).toBeUndefined();
    expect(forwardedHeaders['Idempotency-Key']).toBeUndefined();
  });
});
