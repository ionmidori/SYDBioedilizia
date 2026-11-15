import type { NextRequest } from 'next/server';

const mockRedirect = jest.fn((url: URL) => ({
  type: 'redirect',
  url: url.toString(),
  headers: new Map<string, string>(),
}));

const mockNext = jest.fn((init?: { request?: { headers?: Headers } }) => ({
  type: 'next',
  requestHeaders: init?.request?.headers,
  headers: new Map<string, string>(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    redirect: (url: URL) => mockRedirect(url),
    next: (init?: { request?: { headers?: Headers } }) => mockNext(init),
  },
}));

import { proxy, config as proxyConfig } from '@/proxy';
import nextConfig from '@/next.config';

function makeToken(payload: Record<string, unknown>): string {
  const b64 = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'RS256' })}.${b64(payload)}.sig`;
}

function makeRequest(pathname: string, cookieValue?: string): NextRequest {
  const url = `https://syd.example${pathname}`;
  const headerMap = new Map<string, string>();
  return {
    nextUrl: new URL(url),
    url,
    cookies: {
      get: (name: string) => (name === 'auth-token' && cookieValue ? { name, value: cookieValue } : undefined),
    },
    headers: {
      get: (k: string) => headerMap.get(k.toLowerCase()) ?? null,
      entries: () => headerMap.entries(),
      forEach: (cb: (v: string, k: string) => void) => headerMap.forEach(cb),
    },
  } as unknown as NextRequest;
}

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('proxy.ts anonymous /dashboard guard & unified security headers', () => {
  it('redirects anonymous Firebase tokens away from /dashboard', () => {
    const anonJwt = makeToken({
      uid: 'anon-1',
      exp: FUTURE_EXP,
      firebase: { sign_in_provider: 'anonymous' },
    });

    proxy(makeRequest('/dashboard', anonJwt));

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect.mock.calls[0][0].pathname).toBe('/');
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('allows non-anonymous valid tokens onto /dashboard with aligned security headers', () => {
    const userJwt = makeToken({
      uid: 'u1',
      exp: FUTURE_EXP,
      firebase: { sign_in_provider: 'google.com' },
    });

    const res = proxy(makeRequest('/dashboard', userJwt)) as unknown as {
      headers: Map<string, string>;
    };

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(res.headers.get('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Permissions-Policy')).toBe(
      'camera=(self), microphone=(), geolocation=(), browsing-topics=()',
    );
  });

  it('does not bypass proxy matcher on Next.js router prefetch requests', () => {
    expect(proxyConfig.matcher).toHaveLength(1);
    const entry = proxyConfig.matcher[0] as string | { missing?: unknown };
    if (typeof entry !== 'string') {
      expect(entry.missing).toBeUndefined();
    }
  });
});

describe('next.config.ts unified security headers & rewrites', () => {
  type HeaderRule = { source: string; headers: { key: string; value: string }[] };

  /** The headers Next would send for `path`: every rule whose source matches, later rules winning. */
  async function headersFor(path: string): Promise<Map<string, string>> {
    const { match } = await import('next/dist/compiled/path-to-regexp');
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const merged = new Map<string, string>();
    for (const rule of rules) {
      if (!match(rule.source)(path)) continue;
      for (const { key, value } of rule.headers) merged.set(key, value);
    }
    return merged;
  }

  it('matches proxy security headers on all routes', async () => {
    const headerMap = await headersFor('/faq');

    expect(headerMap.get('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );
    expect(headerMap.get('X-Frame-Options')).toBe('DENY');
    expect(headerMap.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headerMap.get('Permissions-Policy')).toBe(
      'camera=(self), microphone=(), geolocation=(), browsing-topics=()',
    );
  });

  it.each(['/', '/progetti', '/admin/company'])('keeps X-Frame-Options DENY on %s', async (path) => {
    expect((await headersFor(path)).get('X-Frame-Options')).toBe('DENY');
  });

  // Firebase Auth embeds `/__/auth/iframe` in our own page to receive the popup /
  // redirect result. DENY blocks even a same-origin frame: the login then waits
  // forever (the button spins after Google has accepted the user).
  it.each(['/__/auth/iframe', '/__/auth/handler'])('lets the page frame the Firebase Auth handler %s', async (path) => {
    const headerMap = await headersFor(path);
    expect(headerMap.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(headerMap.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('removes legacy /chat/stream rewrite while keeping /api/py/:path* and /__/auth/:path*', async () => {
    const rewrites = await nextConfig.rewrites!();
    const beforeFiles = Array.isArray(rewrites) ? rewrites : rewrites.beforeFiles;
    const sources = beforeFiles.map((r: { source: string }) => r.source);

    expect(sources).not.toContain('/chat/stream');
    expect(sources).toContain('/api/py/:path*');
    expect(sources).toContain('/__/auth/:path*');
  });
});
