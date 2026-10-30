/**
 * Maps a raw error message (backend error text, HTTP status embedded as a
 * substring) to a user-facing Italian message and whether a retry action
 * should be offered.
 *
 * Pure — no React, no timers — so the mapping table is unit-testable without
 * mounting ChatWidget. The caller owns the `setTimeout(…, 0)` deferral and
 * the `error` effect dependency.
 */
export interface MappedChatError {
    message: string;
    retryable: boolean;
}

/** Body of an error from the /api/chat proxy: `{ error_code, message }`. */
export interface ChatErrorBody {
    error_code?: string;
    message?: string;
}

/** The proxy's JSON error body in `raw`, or null when it is plain text. */
export function readErrorBody(raw: string | undefined): ChatErrorBody | null {
    if (!raw?.startsWith('{')) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? (parsed as ChatErrorBody) : null;
    } catch {
        return null;
    }
}

/** The turn went to a chat that is no longer the user's (Phase 139): retrying it
 *  as it is gets the same refusal. */
export const CHAT_MOVED_CODES: ReadonlySet<string> = new Set(['CHAT_MERGED', 'USER_CHAT_MISMATCH']);

export function mapErrorToMessage(rawMessage: string | undefined): MappedChatError {
    const body = readErrorBody(rawMessage);
    if (body?.message && body.error_code && CHAT_MOVED_CODES.has(body.error_code)) {
        return { message: body.message, retryable: false };
    }
    const msg = body?.message || rawMessage || '';
    const lower = msg.toLowerCase();

    if (msg.includes('429') || lower.includes('quota') || lower.includes('rate limit')) {
        return { message: 'Hai raggiunto il limite di richieste. Riprova tra qualche minuto.', retryable: false };
    }
    if (msg.includes('401') || lower.includes('auth')) {
        return { message: 'Sessione scaduta. Ricarica la pagina per continuare.', retryable: false };
    }
    if (msg.includes('503') || msg.includes('502')) {
        return { message: 'Il servizio è temporaneamente non disponibile. Riprova tra poco.', retryable: true };
    }
    return { message: msg || 'Si è verificato un errore. Riprova.', retryable: true };
}
