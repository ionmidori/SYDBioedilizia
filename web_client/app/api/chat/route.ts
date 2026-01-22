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
const SECRET_PREFIX = process.env.INTERNAL_JWT_SECRET ? process.env.INTERNAL_JWT_SECRET.substring(0, 3) : 'UNDEFINED';

console.log('[Proxy Config] URL:', PYTHON_BACKEND_URL);
const secret = process.env.INTERNAL_JWT_SECRET;
console.log('[Proxy Config] Secret starts with:', secret ? secret.substring(0, 3) : 'UNDEFINED');
console.log('[Proxy Config] Secret length:', secret ? secret.length : 0);

export async function POST(req: Request) {
    console.log('----> [Proxy] Chat request received');

    try {
        // Extract request body
        const body = await req.json();
        const { messages, images, imageUrls, mediaUrls, mediaTypes, mediaMetadata, sessionId } = body;

        console.log('[Proxy] Request details:', {
            messagesCount: messages?.length || 0,
            hasImages: !!images,
            imageUrlsCount: imageUrls?.length || 0,
            mediaUrlsCount: mediaUrls?.length || 0,
            mediaTypesCount: mediaTypes?.length || 0,
            hasMediaMetadata: !!mediaMetadata,
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
            imageUrls: imageUrls || [],
            mediaUrls: mediaUrls || [],
            mediaTypes: mediaTypes || [],
            mediaMetadata: mediaMetadata || {}
        };

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🔒 AUTH: Validate Firebase Token & Mint Internal JWT
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const { createInternalToken } = await import('@/lib/auth/jwt');
        const { auth } = await import('@/lib/firebase-admin');

        const authHeader = req.headers.get('Authorization');

        // ✅ Best Practice: Require auth header for ALL requests (including anonymous users)
        if (!authHeader?.startsWith('Bearer ')) {
            return new Response(JSON.stringify({
                error: 'Authentication required',
                details: 'Missing or invalid Authorization header. Please ensure Firebase authentication is enabled.'
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        let internalToken: string;

        try {
            // Verify Firebase ID Token (works for both anonymous and authenticated users)
            const idToken = authHeader.split('Bearer ')[1];
            const decodedToken = await auth().verifyIdToken(idToken);

            // Create Internal JWT
            internalToken = createInternalToken({
                uid: decodedToken.uid,
                email: decodedToken.email || 'anonymous',
            });

            const userType = decodedToken.firebase?.sign_in_provider === 'anonymous' ? 'Anonymous' : 'Authenticated';
            console.log(`[Proxy] ${userType} user: ${decodedToken.uid}`);
            console.log('[Proxy] DEBUG Internal Token:', internalToken);
        } catch (authError) {
            console.error('[Proxy] Auth verification failed:', authError);
            return new Response(JSON.stringify({
                error: 'Authentication failed',
                details: authError instanceof Error ? authError.message : 'Invalid Firebase token'
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
