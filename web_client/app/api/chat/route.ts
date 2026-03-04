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

interface SDKMessagePart {
    type: string;
    text?: string;
}

interface SDKMessage {
    role: string;
    content?: string | (string | SDKMessagePart)[];
    parts?: SDKMessagePart[];
}

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


        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🔄 NORMALIZE: Vercel AI SDK v3+ → Backend Contract
        // SDK sends {role, parts: [{type, text}]}, Backend expects {role, content: string}
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const normalizedMessages = (messages as SDKMessage[] || []).map((msg) => {
            // If message already has 'content' as string, pass through
            if (typeof msg.content === 'string') {
                return { role: msg.role, content: msg.content };
            }
            // If message has 'parts' array (Vercel AI SDK v3+ format), extract text
            if (Array.isArray(msg.parts)) {
                const textContent = msg.parts
                    .filter((p) => p.type === 'text')
                    .map((p) => p.text)
                    .join('');
                return { role: msg.role, content: textContent };
            }
            // If content is an array (legacy format), stringify
            if (Array.isArray(msg.content)) {
                const textContent = msg.content
                    .filter((p) => typeof p === 'string' || (typeof p === 'object' && p !== null && 'type' in p && p.type === 'text'))
                    .map((p) => typeof p === 'string' ? p : (p as SDKMessagePart).text)
                    .join('');
                return { role: msg.role, content: textContent };
            }
            // Fallback: stringify whatever we got
            return { role: msg.role, content: String(msg.content || '') };
        });

        // Build payload for Python backend
        const pythonPayload = {
            messages: normalizedMessages,
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
        const appCheckToken = req.headers.get('X-Firebase-AppCheck');

        console.log('[Proxy] Forwarding to Python backend:', PYTHON_BACKEND_URL);

        // Forward to Python backend
        const proxyHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
            'Connection': 'close', // ⚡ Explicitly disable Keep-Alive upstream
        };
        if (appCheckToken) {
            proxyHeaders['X-Firebase-AppCheck'] = appCheckToken;
        }

        const pythonResponse = await fetch(`${PYTHON_BACKEND_URL}/chat/stream`, {
            method: 'POST',
            cache: 'no-store', // ⚡ CRITICAL: Disable Next.js buffering
            headers: proxyHeaders,
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
        // AI SDK v6 / @ai-sdk/react v3 uses Data Stream Protocol:
        // header: x-vercel-ai-data-stream: v1 (NOT ui-message-stream)
        // body format: 0:"text chunk"\n (as produced by our backend stream_protocol.py)
        return new Response(stream, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'x-vercel-ai-data-stream': 'v1',
                'X-Accel-Buffering': 'no',
                'Cache-Control': 'no-cache, no-transform, no-store',
                'Connection': 'keep-alive',
            },
        });

    } catch (error: unknown) {
        console.error('[Proxy] Error:', error);
        return new Response(JSON.stringify({
            error: 'Proxy Error',
            details: 'An internal error occurred while processing the request.',
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
