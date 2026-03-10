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
  } catch { return true; }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Auth Guard and Security Headers
  if (pathname.startsWith('/dashboard')) {
    const authToken = request.cookies.get('auth-token');
    if (!authToken || isTokenExpired(authToken.value)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // 2. CSP and Nonce Logic
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  // 3. Maintenance Logic (only in prod)
  const isMaintenanceMode = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true';
  const isDev = process.env.NODE_ENV === 'development';

  if (!isDev && isMaintenanceMode) {
    // Basic bypass list for maintenance
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

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Security and CSP headers
  // response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
