import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  // CSP for Next.js 16 (App Router)
  // Phase 1: Report-Only mode — logs violations without blocking anything.
  // Once Cloud Logging shows zero violations, switch to enforcing mode by
  // changing the header from Content-Security-Policy-Report-Only to
  // Content-Security-Policy.
  //
  // strict-dynamic: scripts loaded by a nonced script are auto-trusted.
  // unsafe-inline: ignored by browsers that support nonces (fallback for legacy).
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
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, ' ').trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Report-Only: violations are logged to the browser console and any
  // configured report-uri endpoint, but nothing is blocked.
  response.headers.set('Content-Security-Policy-Report-Only', cspHeader);
  response.headers.set('x-nonce', nonce);

  // Security Headers (defense-in-depth)
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)');

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, manifest.json, robots.txt, sitemap.xml (static assets)
     */
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sitemap.xml).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
