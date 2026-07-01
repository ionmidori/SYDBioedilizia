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

  // 3. CSP (F-01) — ENFORCING (was Content-Security-Policy-Report-Only).
  //
  // We deliberately do NOT use a per-request nonce + 'strict-dynamic' here:
  // most public pages are statically prerendered, so Next.js cannot inject a
  // per-request nonce into their <script> tags. Under 'strict-dynamic' a CSP3
  // browser ignores 'self'/'unsafe-inline', which would BLOCK the (un-nonced)
  // /_next/ chunks and break every static page (verified via `next start`).
  //
  // Instead we enforce a policy that works on static + dynamic routes: scripts
  // limited to 'self' + trusted Google/Firebase origins (reCAPTCHA/App Check),
  // 'unsafe-inline' retained only because static bootstrap scripts can't be
  // nonced. This still hard-enforces object-src 'none', base-uri 'self',
  // form-action 'self', frame-ancestors 'none', and connect/img/frame allowlists
  // — real defense-in-depth on top of React's output escaping.
  // FOLLOW-UP: a full nonce/'strict-dynamic' CSP requires converting pages to
  // dynamic rendering (force-dynamic) so a per-request nonce can be emitted.
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com https://apis.google.com;
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https://firebasestorage.googleapis.com https://storage.googleapis.com https://*.googleusercontent.com https://images.unsplash.com https://replicate.delivery;
    font-src 'self' data:;
    connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.google-analytics.com https://vitals.vercel-insights.com https://*.vercel-insights.com https://*.run.app https://www.google.com https://www.gstatic.com wss://*.firebaseio.com;
    media-src 'self' blob: https://firebasestorage.googleapis.com https://storage.googleapis.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    frame-src 'self' https://chatbotluca-a8a73.firebaseapp.com https://www.google.com https://recaptcha.google.com;
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, ' ').trim();

  const response = NextResponse.next();

  // Security Headers
  response.headers.set('Content-Security-Policy', cspHeader);
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
