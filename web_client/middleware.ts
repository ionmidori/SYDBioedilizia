import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // -----------------------------------------------------------------
    // 1. Authentication Guard (Runs in all environments)
    // Protects /dashboard routes by checking for the session cookie
    // -----------------------------------------------------------------
    if (pathname.startsWith('/dashboard')) {
        const authToken = request.cookies.get('auth-token')

        if (!authToken) {
            // User is not authenticated, redirect to login
            return NextResponse.redirect(new URL('/', request.url))
        }
    }

    // -----------------------------------------------------------------
    // 2. Maintenance Mode Logic
    // -----------------------------------------------------------------

    // Bypass maintenance mode in development
    if (process.env.NODE_ENV === 'development') {
        return NextResponse.next()
    }

    // Check for maintenance mode via environment variable
    const isMaintenanceMode = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true'

    if (!isMaintenanceMode) {
        return NextResponse.next()
    }

    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/static') ||
        pathname.startsWith('/api') ||
        pathname === '/maintenance' ||
        pathname.includes('.') // file extensions (images, etc)
    ) {
        return NextResponse.next()
    }

    // Rewrite EVERYTHING else to maintenance
    return NextResponse.rewrite(new URL('/maintenance', request.url))
}

export const config = {
    matcher: '/((?!api|_next/static|_next/image|favicon.ico).*)',
}
