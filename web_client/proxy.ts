import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildCspHeader, generateNonce, isStrictCspPath } from '@/lib/security/csp';
import { hasAdminRoleClaim, isTokenExpired } from '@/lib/security/jwt-claims';

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

  // 2b. Admin console (Phase 128). UX-only early redirect: the cookie token is
  //     NOT verified here. The real gate is the backend (`require_admin` on
  //     every /api/admin route, Firebase-verified token, role=admin claim).
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
  if (isAdminPath) {
    const authToken = request.cookies.get('auth-token');
    if (!authToken || isTokenExpired(authToken.value)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    if (!hasAdminRoleClaim(authToken.value)) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // 3. CSP (F-01 + issue #133) — ENFORCING, route-scoped (see lib/security/csp.ts):
  //
  // - /dashboard/* is rendered dynamically (force-dynamic in its layout), so we
  //   generate a per-request nonce and send the STRICT policy
  //   (nonce + 'strict-dynamic', no effective 'unsafe-inline' on CSP3 browsers).
  //   The nonce travels on the REQUEST headers (x-nonce + Content-Security-Policy)
  //   so Next.js stamps it onto every <script> it emits during SSR.
  //
  // - Statically prerendered routes (landing, blog, FAQ, legal) cannot carry a
  //   per-request nonce ('strict-dynamic' would block the un-nonced /_next/
  //   chunks — verified via `next start`), so they keep the FALLBACK policy:
  //   script-src 'self' + trusted Google origins + 'unsafe-inline'.
  const useStrictCsp = isStrictCspPath(pathname);
  const nonce = useStrictCsp ? generateNonce() : undefined;
  const cspHeader = buildCspHeader({ nonce, isDev });

  let response: NextResponse;
  if (nonce) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', cspHeader);
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else {
    response = NextResponse.next();
  }

  // Security Headers
  response.headers.set('Content-Security-Policy', cspHeader);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)');
  if (isAdminPath) {
    // Never index the console, even if a URL leaks (robots.txt alone is advisory).
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }

  return response;
}

export const config = {
  matcher: [
    {
      // `__/` = Firebase Auth handler proxied to firebaseapp.com (next.config.ts):
      // our CSP and `X-Frame-Options: DENY` would break its iframe and scripts.
      source: '/((?!api|__/|_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sitemap.xml).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
