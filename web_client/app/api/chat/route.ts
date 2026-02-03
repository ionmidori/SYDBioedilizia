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

export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8080';

console.log('[Proxy Config] URL:', PYTHON_BACKEND_URL);

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
        // 🔒 AUTH: Forward Token (Verification is in Python)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // NOTE: We do NOT verify the token here to ensure Zero Latency.
        // The Python backend performs verification *inside* the stream
        // after yielding the initial "..." chunk.

        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return new Response(JSON.stringify({
                error: 'Authentication required',
                details: 'Missing or invalid Authorization header.'
            }), { status: 401 });
        }

        const idToken = authHeader.split('Bearer ')[1];

        console.log('[Proxy] Forwarding to Python backend:', PYTHON_BACKEND_URL);

        // Forward to Python backend
        const pythonResponse = await fetch(`${PYTHON_BACKEND_URL}/chat/stream`, {
            method: 'POST',
            cache: 'no-store', // ⚡ CRITICAL: Disable Next.js buffering
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
                'Connection': 'close', // ⚡ Explicitly disable Keep-Alive upstream
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

        // 🛠️ MANUAL STREAM BRIDGE
        // We manually read the stream to ensure the controller closes immediately
        // when the upstream reader is done, preventing socket timeout delays.
        const reader = pythonResponse.body?.getReader();
        if (!reader) {
            throw new Error("Failed to get reader from Python response");
        }

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            controller.close();
                            break;
                        }
                        controller.enqueue(value);
                    }
                } catch (err) {
                    console.error("[Proxy] Stream Error:", err);
                    controller.error(err);
                }
            }
        });

        // Return the manual stream
        return new Response(stream, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'X-Vercel-AI-Data-Stream': 'v1',
                'Cache-Control': 'no-cache, no-transform, no-store',
                'Connection': 'keep-alive',
                'X-Content-Type-Options': 'nosniff',
                'Transfer-Encoding': 'chunked'
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
