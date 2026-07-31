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

export function mapErrorToMessage(rawMessage: string | undefined): MappedChatError {
    const msg = rawMessage || '';
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
