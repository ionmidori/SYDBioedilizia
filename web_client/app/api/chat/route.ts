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

import { normalizeMessagesForBackend, type SDKMessage } from './normalize-messages';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8080';

console.log('[Proxy Config] URL:', PYTHON_BACKEND_URL);

export async function POST(req: Request) {
    console.log('----> [Proxy] Chat request received');

    try {
        // Extract request body
        const body = await req.json();
        const { messages, images, imageUrls, mediaUrls, mediaTypes, mediaMetadata, sessionId, projectId, is_authenticated } = body;

        console.log('[Proxy] Request details:', {
            messagesCount: messages?.length || 0,
            hasImages: !!images,
            imageUrlsCount: imageUrls?.length || 0,
            mediaUrlsCount: mediaUrls?.length || 0,
            mediaTypesCount: mediaTypes?.length || 0,
            hasMediaMetadata: !!mediaMetadata,
            sessionId,
            projectId,
            is_authenticated
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
        // Flatten messages to { role, content } and forward the client AI SDK id
        // (tool rows are filtered out — their data lives inside the assistant message).
        // Preserving the id lets the backend persist the user message under the same
        // identity the streamed bubble already has, keeping the chat from flickering.
        const normalizedMessages = normalizeMessagesForBackend(messages as SDKMessage[]);

        // Build payload for Python backend
        const pythonPayload = {
            messages: normalizedMessages,
            sessionId: sessionId,
            projectId: projectId,
            is_authenticated: is_authenticated || false,
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

        // 60s timeout for headers (backend must start streaming within 60s).
        // The stream itself is unlimited (AbortController is only for initial connect).
        const connectAbort = new AbortController();
        const connectTimeout = setTimeout(() => connectAbort.abort(), 60_000);

        let pythonResponse: Response;
        try {
            pythonResponse = await fetch(`${PYTHON_BACKEND_URL}/chat/stream`, {
                method: 'POST',
                cache: 'no-store', // ⚡ CRITICAL: Disable Next.js buffering
                headers: proxyHeaders,
                body: JSON.stringify(pythonPayload),
                signal: connectAbort.signal,
            });
        } finally {
            clearTimeout(connectTimeout);
        }

        if (!pythonResponse.ok) {
            const errorText = await pythonResponse.text();
            console.error('[Proxy] Python backend error:', pythonResponse.status, errorText);

            // Parse structured error from backend (APIErrorResponse format)
            let errorCode = 'BACKEND_ERROR';
            let userMessage = 'Si è verificato un errore. Riprova tra poco.';

            try {
                const parsed = JSON.parse(errorText);
                errorCode = parsed.error_code || errorCode;
                // Only forward safe, structured messages — never raw stack traces
                if (parsed.message) userMessage = parsed.message;
            } catch {
                // errorText is not JSON — don't expose raw backend output
            }

            const responseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };

            // Forward Retry-After header for 429 responses
            const retryAfter = pythonResponse.headers.get('Retry-After');
            if (pythonResponse.status === 429 && retryAfter) {
                responseHeaders['Retry-After'] = retryAfter;
            }

            return new Response(JSON.stringify({
                error_code: errorCode,
                message: userMessage,
            }), {
                status: pythonResponse.status,
                headers: responseHeaders,
            });
        }

        console.log('[Proxy] ✅ Streaming response from Python backend');

        // Tee the stream: log chunks AND forward to client
        // This helps diagnose if data is flowing through the proxy correctly
        const { readable: clientStream, writable } = new TransformStream();
        const writer = writable.getWriter();

        (async () => {
            try {
                const reader = pythonResponse.body!.getReader();
                let totalChunks = 0;
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        console.log(`[Proxy] Stream complete (${totalChunks} chunks sent to client)`);
                        await writer.close();
                        break;
                    }
                    totalChunks++;
                    const text = new TextDecoder().decode(value);
                    console.log(`[Proxy] Chunk ${totalChunks}: ${JSON.stringify(text)}`);
                    await writer.write(value);
                }
            } catch (err) {
                console.error('[Proxy] Stream error:', err);
                await writer.abort(err);
            }
        })();

        return new Response(clientStream, {
            status: 200,
            headers: {
                // AI SDK v7 UI Message Stream protocol (SSE). The backend emits
                // `data: {...}\n\n` frames; @ai-sdk/react parses them via this header.
                'Content-Type': 'text/event-stream; charset=utf-8',
                'x-vercel-ai-ui-message-stream': 'v1',
                'X-Accel-Buffering': 'no',
                'Cache-Control': 'no-cache, no-transform, no-store',
                'Connection': 'keep-alive',
            },
        });


    } catch (error: unknown) {
        console.error('[Proxy] Error:', error);
        const isTimeout = error instanceof Error && error.name === 'AbortError';
        return new Response(JSON.stringify({
            error_code: isTimeout ? 'BACKEND_TIMEOUT' : 'PROXY_ERROR',
            message: isTimeout
                ? 'Il backend non ha risposto entro 60 secondi. Riprova tra poco.'
                : 'Si è verificato un errore interno. Riprova tra poco.',
        }), {
            status: isTimeout ? 504 : 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
