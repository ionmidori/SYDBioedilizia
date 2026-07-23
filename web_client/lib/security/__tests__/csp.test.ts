import { buildCspHeader, generateNonce, isStrictCspPath } from '../csp';

describe('isStrictCspPath', () => {
  it.each(['/dashboard', '/dashboard/', '/dashboard/quotes', '/dashboard/abc/files'])(
    'returns true for dashboard route %s',
    (path) => {
      expect(isStrictCspPath(path)).toBe(true);
    }
  );

  it.each(['/', '/blog', '/faq', '/dashboardfoo', '/auth/verify', '/privacy'])(
    'returns false for non-dashboard route %s',
    (path) => {
      expect(isStrictCspPath(path)).toBe(false);
    }
  );
});

describe('generateNonce', () => {
  it('returns a base64 string encoding 16 random bytes', () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(atob(nonce)).toHaveLength(16);
  });

  it('returns a different value on each call', () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});

describe('buildCspHeader — fallback policy (static routes)', () => {
  const header = buildCspHeader();

  it('does NOT contain a nonce or strict-dynamic', () => {
    expect(header).not.toContain('nonce-');
    expect(header).not.toContain("'strict-dynamic'");
  });

  it("keeps script-src 'self' 'unsafe-inline' + trusted Google origins", () => {
    expect(header).toContain(
      "script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com https://apis.google.com;"
    );
  });

  it('is a single collapsed line (valid header value)', () => {
    expect(header).not.toMatch(/\n/);
    expect(header).not.toMatch(/\s{2,}/);
  });
});

describe('buildCspHeader — strict policy (nonce routes)', () => {
  const nonce = 'dGVzdC1ub25jZQ==';
  const header = buildCspHeader({ nonce });

  it("puts 'nonce-…' and 'strict-dynamic' first in script-src", () => {
    expect(header).toContain(`script-src 'nonce-${nonce}' 'strict-dynamic'`);
  });

  it('retains CSP2 fallbacks after strict-dynamic (ignored by CSP3 browsers)', () => {
    const scriptSrc = header.split(';').find((d) => d.trim().startsWith('script-src'));
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).toContain('https://www.gstatic.com');
  });

  it("omits 'unsafe-eval' in production", () => {
    expect(header).not.toContain("'unsafe-eval'");
  });

  it("adds 'unsafe-eval' only in dev (React Refresh)", () => {
    expect(buildCspHeader({ nonce, isDev: true })).toContain(
      `'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    );
  });
});

describe('buildCspHeader — directives shared by both policies', () => {
  it.each([
    ["object-src 'none'"],
    ["base-uri 'self'"],
    ["form-action 'self'"],
    ["frame-ancestors 'none'"],
    ['upgrade-insecure-requests'],
    ["style-src 'self' 'unsafe-inline'"],
    ['https://syd-brain-w6yrkh3gfa-ew.a.run.app'],
    ['wss://*.firebaseio.com'],
  ])('both policies contain %s', (directive) => {
    expect(buildCspHeader()).toContain(directive);
    expect(buildCspHeader({ nonce: 'abc' })).toContain(directive);
  });
});
