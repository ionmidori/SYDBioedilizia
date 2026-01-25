import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    // Check for maintenance mode via environment variable (optional) or hardcoded enforcement
    // For this task, we enforce it everywhere except internal routes/maintenance page

    if (
        request.nextUrl.pathname.startsWith('/_next') ||
        request.nextUrl.pathname.startsWith('/static') ||
        request.nextUrl.pathname.startsWith('/api') || // Optional: keep API alive? User said "site not function", usually means UI.
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
