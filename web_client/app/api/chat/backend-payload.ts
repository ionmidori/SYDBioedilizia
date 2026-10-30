import { normalizeMessagesForBackend, type SDKMessage } from './normalize-messages';

/** Body the client (`useChatTransport`) posts to /api/chat. */
export interface ChatProxyBody {
    messages?: SDKMessage[];
    sessionId: string;
    is_authenticated?: boolean;
    imageUrls?: string[];
    mediaUrls?: string[];
    mediaTypes?: string[];
    mediaMetadata?: Record<string, unknown>;
    videoFileUris?: string[];
    /** Room of the chat the turn is about (Phase 138); checked by the backend. */
    roomId?: string | null;
}

/**
 * Payload for the Python backend (`ChatRequest` in backend_python/main.py).
 * Every media field the backend reads must be listed here: a field left out
 * is silently dropped by the proxy (videoFileUris was, so no video ever
 * reached the model).
 */
export function buildBackendPayload(body: ChatProxyBody) {
    return {
        messages: normalizeMessagesForBackend(body.messages ?? []),
        sessionId: body.sessionId,
        is_authenticated: body.is_authenticated || false,
        imageUrls: body.imageUrls || [],
        mediaUrls: body.mediaUrls || [],
        mediaTypes: body.mediaTypes || [],
        mediaMetadata: body.mediaMetadata || {},
        videoFileUris: body.videoFileUris || [],
        roomId: body.roomId || null,
    };
}
