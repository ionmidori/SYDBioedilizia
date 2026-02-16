
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60; // Standard duration for auth requests
export const dynamic = 'force-dynamic';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8080';

async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    // Await params as per Next.js 15+ requirements
    const resolvedParams = await params;

    // 1. Construct the target URL
    // Join the path segments: e.g. ["register", "options"] -> "register/options"
    const path = resolvedParams.path.join('/');
    const targetUrl = `${PYTHON_BACKEND_URL}/api/passkey/${path}`;

    console.log(`[Passkey Proxy] Forwarding ${req.method} request to: ${targetUrl}`);

    try {
        // 2. Prepare headers
        // Forward Authorization and App Check headers to backend
        const headers = new Headers();
        const authHeader = req.headers.get('Authorization');
        const appCheckHeader = req.headers.get('X-Firebase-AppCheck');

        if (authHeader) {
            headers.set('Authorization', authHeader);
        }
        if (appCheckHeader) {
            headers.set('X-Firebase-AppCheck', appCheckHeader);
        }

        // 🚨 CRITICAL: Forward Origin and Host for WebAuthn RP_ID detection
        const origin = req.headers.get('origin');
        const host = req.headers.get('host');

        if (origin) {
            // Forward original origin (e.g. https://sydbioedilizia.vercel.app)
            headers.set('Origin', origin);
        }

        if (host) {
            // Forward original host (e.g. sydbioedilizia.vercel.app)
            headers.set('X-Forwarded-Host', host);
        }

        headers.set('Content-Type', 'application/json');

        // 3. Extract body (if present)
        let body = null;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            try {
                body = JSON.stringify(await req.json());
            } catch (e) {
                console.warn('[Passkey Proxy] No JSON body found or parsing failed');
            }
        }

        // 4. Forward the request to Python Backend
        const response = await fetch(targetUrl, {
            method: req.method,
            headers,
            body,
            cache: 'no-store'
        });

        // 5. Handle the response
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Passkey Proxy] Backend Error (${response.status}):`, errorText);

            // Try to parse error as JSON to return structured error
            try {
                const errorJson = JSON.parse(errorText);
                return NextResponse.json(errorJson, { status: response.status });
            } catch {
                return NextResponse.json(
                    { error: 'Backend Error', details: errorText },
                    { status: response.status }
                );
            }
        }

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });

    } catch (error: any) {
        console.error('[Passkey Proxy] Internal Error:', error);
        return NextResponse.json(
            { error: 'Proxy Error', details: error.message },
            { status: 500 }
        );
    }
}

export { handler as GET, handler as POST };
