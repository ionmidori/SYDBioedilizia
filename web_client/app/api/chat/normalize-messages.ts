/**
 * Normalize the AI SDK message list before forwarding it to the Python backend.
 *
 * Besides flattening each message to `{ role, content }`, this preserves the
 * client-generated AI SDK `id`. The backend persists the user message under that
 * id (Firestore document id), so the streamed (optimistic) bubble and its stored
 * row share one identity — the same end-to-end-stable-id contract that keeps the
 * assistant bubble from re-mounting and flickering on post-turn sync.
 */

export interface SDKMessagePart {
    type: string;
    text?: string;
}

export interface SDKMessage {
    id?: string;
    role: string;
    content?: string | (string | SDKMessagePart)[];
    parts?: SDKMessagePart[];
}

export interface NormalizedMessage {
    id?: string;
    role: string;
    content: string;
}

function toTextContent(msg: SDKMessage): string {
    // Already a plain string
    if (typeof msg.content === 'string') {
        return msg.content;
    }
    // Vercel AI SDK v3+ `parts` array
    if (Array.isArray(msg.parts)) {
        return msg.parts
            .filter((p) => p && p.type === 'text')
            .map((p) => p.text || '')
            .join('');
    }
    // Legacy array content
    if (Array.isArray(msg.content)) {
        return msg.content
            .filter((p) => typeof p === 'string' || (typeof p === 'object' && p !== null && 'type' in p && p.type === 'text'))
            .map((p) => (typeof p === 'string' ? p : (p as SDKMessagePart).text))
            .join('');
    }
    // Fallback: stringify whatever we got
    return String(msg.content || '');
}

export function normalizeMessagesForBackend(messages: SDKMessage[] | undefined): NormalizedMessage[] {
    // `messages` comes from the untrusted request body, so guard against a
    // non-array value (would throw on .filter) and null/undefined entries.
    // Tool messages are already merged into assistant toolInvocations by
    // useChatHistory and are not needed by the backend for processing.
    return (Array.isArray(messages) ? messages : [])
        .filter((msg) => msg && msg.role !== 'tool')
        .map((msg) => {
            const normalized: NormalizedMessage = { role: msg.role, content: toTextContent(msg) };
            if (msg.id) {
                normalized.id = msg.id;
            }
            return normalized;
        });
}
