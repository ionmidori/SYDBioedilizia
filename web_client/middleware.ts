import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
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
        request.nextUrl.pathname.startsWith('/_next') ||
        request.nextUrl.pathname.startsWith('/static') ||
        request.nextUrl.pathname.startsWith('/api') ||
        request.nextUrl.pathname === '/maintenance' ||
        request.nextUrl.pathname.includes('.') // file extensions (images, etc)
    ) {
        return NextResponse.next()
    }

    // Rewrite EVERYTHING else to maintenance
    return NextResponse.rewrite(new URL('/maintenance', request.url))
}

export const config = {
    matcher: '/((?!api|_next/static|_next/image|favicon.ico).*)',
}
