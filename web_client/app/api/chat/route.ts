/**
 * MINIMAL PROXY TO PYTHON BACKEND
 * 
 * This route forwards chat requests to the Python backend (FastAPI)
 * which handles:
 * - AI Logic (LangGraph + Gemini)
 * - Message Persistence (Firestore)
 * - Tool Execution (Renders, Leads, Market Prices)
 * - Auth Verification (JWT)
 */

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8080';

export async function POST(req: Request) {
    console.log('----> [Proxy] Chat request received');

    try {
        // Extract request body
        const body = await req.json();
        const { messages, images, imageUrls, sessionId } = body;

        console.log('[Proxy] Request details:', {
            messagesCount: messages?.length || 0,
            hasImages: !!images,
            imageUrlsCount: imageUrls?.length || 0,
            sessionId
        });

        // Validate sessionId
        if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
            return new Response(JSON.stringify({
                error: 'sessionId is required'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }


        // Build payload for Python backend
        const pythonPayload = {
            messages: messages || [],
            sessionId: sessionId,
            imageUrls: imageUrls || []
        };

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🔒 AUTH: Validate Firebase Token & Mint Internal JWT
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const { createInternalToken } = await import('@/lib/auth/jwt');
        const { auth } = await import('@/lib/firebase-admin');

        const authHeader = req.headers.get('Authorization');

        let internalToken: string;

        try {
            if (authHeader?.startsWith('Bearer ')) {
                // 1. Verify User Token
                const idToken = authHeader.split('Bearer ')[1];
                const decodedToken = await auth().verifyIdToken(idToken);

                // 2. Create Internal JWT for authenticated user
                internalToken = createInternalToken({
                    uid: decodedToken.uid,
                    email: decodedToken.email || 'unknown',
                });
                console.log(`[Proxy] Authenticated user: ${decodedToken.uid}`);
            } else {
                // 1. Guest Mode
                const guestUid = `guest-${sessionId.substring(0, 8)}`;

                // 2. Create Internal JWT for guest
                internalToken = createInternalToken({
                    uid: guestUid,
                    email: 'guest@renovation.ai',
                });
                console.log(`[Proxy] Guest access: ${guestUid}`);
            }
        } catch (authError) {
            console.error('[Proxy] Auth verification failed:', authError);
            return new Response(JSON.stringify({
                error: 'Authentication failed',
                details: authError instanceof Error ? authError.message : 'Unknown auth error'
            }), { status: 401 });
        }

        console.log('[Proxy] Forwarding to Python backend:', PYTHON_BACKEND_URL);

        // Forward to Python backend
        const pythonResponse = await fetch(`${PYTHON_BACKEND_URL}/chat/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${internalToken}`, // ✅ Send Internal JWT
            },
            body: JSON.stringify(pythonPayload)
        });

        if (!pythonResponse.ok) {
            const errorText = await pythonResponse.text();
            console.error('[Proxy] Python backend error:', pythonResponse.status, errorText);

            return new Response(JSON.stringify({
                error: 'Backend Error',
                details: errorText,
                status: pythonResponse.status
            }), {
                status: pythonResponse.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        console.log('[Proxy] ✅ Streaming response from Python backend');

        // Return Python's stream directly to client
        // Python backend implements Vercel Data Stream Protocol
        return new Response(pythonResponse.body, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'X-Vercel-AI-Data-Stream': 'v1',
            },
        });

    } catch (error: any) {
        console.error('[Proxy] Error:', error);
        return new Response(JSON.stringify({
            error: 'Proxy Error',
            details: error.message,
            stack: error.stack
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
