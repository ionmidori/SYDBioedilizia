/**
 * Feedback proxy route — forwards to Python backend POST /feedback.
 * Pattern: same as api/chat/route.ts (minimal proxy, auth forwarded).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8080';

export async function POST(req: Request) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const body = await req.json();

        const proxyHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
        };

        const appCheckToken = req.headers.get('X-Firebase-AppCheck');
        if (appCheckToken) {
            proxyHeaders['X-Firebase-AppCheck'] = appCheckToken;
        }

        const backendResponse = await fetch(`${PYTHON_BACKEND_URL}/feedback`, {
            method: 'POST',
            headers: proxyHeaders,
            body: JSON.stringify(body),
        });

        const responseText = await backendResponse.text();

        return new Response(responseText, {
            status: backendResponse.status,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('[Feedback Proxy] Error:', error);
        return new Response(JSON.stringify({ error: 'Internal error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
