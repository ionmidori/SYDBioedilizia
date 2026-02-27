import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Validates a Firebase JWT token by decoding the payload and checking the `exp` claim.
 * Uses only Edge Runtime-compatible APIs (atob, base64url normalization).
 * Does NOT verify the signature — signature verification must happen server-side.
 *
 * @returns true if the token is structurally valid and not expired, false otherwise.
 */
function isTokenExpired(token: string): boolean {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return true; // Malformed JWT

        // base64url → base64 (replace URL-safe chars, add padding)
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
        const payload = JSON.parse(atob(padded)) as Record<string, unknown>;

        if (typeof payload.exp !== 'number') return true; // No expiry claim

        // exp is Unix seconds; add 10s clock skew tolerance
        return Date.now() / 1000 > payload.exp + 10;
    } catch {
        return true; // Any parse error → treat as expired/invalid
    }
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl
    const response = NextResponse.next();

    // 🛡️ Security Headers
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // -----------------------------------------------------------------
    // 1. Authentication Guard (Runs in all environments)
    // Protects /dashboard routes by checking for the session cookie
    // -----------------------------------------------------------------
    if (pathname.startsWith('/dashboard')) {
        const authToken = request.cookies.get('auth-token')

        if (!authToken || isTokenExpired(authToken.value)) {
            // Token missing or expired — redirect to login
            return NextResponse.redirect(new URL('/', request.url))
        }
    }

    // -----------------------------------------------------------------
    // 2. Maintenance Mode Logic
    // -----------------------------------------------------------------

    // Bypass maintenance mode in development
    if (process.env.NODE_ENV === 'development') {
        return response;
    }

    // Check for maintenance mode via environment variable
    const isMaintenanceMode = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true'

    if (!isMaintenanceMode) {
        return response;
    }

    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/static') ||
        pathname.startsWith('/api') ||
        pathname === '/maintenance' ||
        pathname.includes('.') // file extensions (images, etc)
    ) {
        return response;
    }

    // Rewrite EVERYTHING else to maintenance
    return NextResponse.rewrite(new URL('/maintenance', request.url))
}

export const config = {
    matcher: '/((?!api|_next/static|_next/image|favicon.ico).*)',
}
