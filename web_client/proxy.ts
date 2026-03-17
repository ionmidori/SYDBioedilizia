import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Validates a Firebase JWT token's structural validity and expiration.
 */
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    if (typeof payload.exp !== 'number') return true;
    return Date.now() / 1000 > payload.exp + 10;
  } catch {
    return true;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Maintenance Mode logic (only in prod)
  const isMaintenanceMode = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true';
  const isDev = process.env.NODE_ENV === 'development';

  if (!isDev && isMaintenanceMode) {
    if (
      !pathname.startsWith('/_next') &&
      !pathname.startsWith('/static') &&
      !pathname.startsWith('/api') &&
      pathname !== '/maintenance' &&
      !pathname.includes('.')
    ) {
      return NextResponse.rewrite(new URL('/maintenance', request.url));
    }
  }

  // 2. Auth Guard for Dashboard
  if (pathname.startsWith('/dashboard')) {
    const authToken = request.cookies.get('auth-token');
    if (!authToken || isTokenExpired(authToken.value)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // 3. CSP and Nonce Logic
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  // CSP for Next.js 16 (App Router)
  // Phase 1: Report-Only mode — logs violations without blocking anything.
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' https:;
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https://firebasestorage.googleapis.com https://storage.googleapis.com https://*.googleusercontent.com;
    font-src 'self' data:;
    connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.google-analytics.com https://vitals.vercel-insights.com https://*.vercel-insights.com wss://*.firebaseio.com;
    media-src 'self' blob: https://firebasestorage.googleapis.com https://storage.googleapis.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    frame-src 'self' https://chatbotluca-a8a73.firebaseapp.com;
  `.replace(/\s{2,}/g, ' ').trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Security Headers
  response.headers.set('Content-Security-Policy-Report-Only', cspHeader);
  response.headers.set('x-nonce', nonce);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)');

  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sitemap.xml).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
