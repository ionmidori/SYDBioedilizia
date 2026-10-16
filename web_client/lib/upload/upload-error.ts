/**
 * Turns a failed upload response into something the user can act on.
 *
 * The backend answers a used-up quota with a 429 whose `message` already says
 * when to retry ("... Riprova domani dopo le 09:10."), and a quota store that
 * cannot answer with a 503. Both messages are written for users, so they are
 * shown as they are; every other body is English/technical and is replaced by
 * Italian text keyed on the status.
 *
 * Pure — no React — so the mapping is unit-testable on its own.
 */
export interface UploadFailure {
    /** User-facing, Italian. */
    message: string;
    /** Backend `error_code`, when the body carried one. */
    code?: string;
    /** Whether offering a retry button makes sense. */
    retryable: boolean;
}

/** Codes whose backend `message` is written for users and is shown verbatim. */
const USER_FACING_CODES = new Set(['QUOTA_EXCEEDED', 'QUOTA_UNAVAILABLE', 'FEATURE_NOT_AVAILABLE']);

const GENERIC: UploadFailure = { message: 'Caricamento non riuscito. Riprova.', retryable: true };

function readBody(responseText: string): { code?: string; message?: string } {
    try {
        const parsed: unknown = JSON.parse(responseText);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
        const { error_code, message } = parsed as Record<string, unknown>;
        return {
            code: typeof error_code === 'string' ? error_code : undefined,
            message: typeof message === 'string' && message.trim() ? message : undefined,
        };
    } catch {
        return {};
    }
}

export function parseUploadError(status: number, responseText: string): UploadFailure {
    const { code, message } = readBody(responseText);
    const shown = code && USER_FACING_CODES.has(code) ? message : undefined;

    if (status === 429) {
        if (code === 'QUOTA_EXCEEDED') {
            // Retrying cannot help before the allowance renews.
            return { message: shown ?? 'Hai raggiunto il limite di caricamenti. Riprova più tardi.', code, retryable: false };
        }
        return { message: 'Troppe richieste. Riprova tra poco.', code, retryable: true };
    }
    if (status === 503) {
        return {
            message: shown ?? 'Servizio momentaneamente non disponibile. Riprova tra qualche minuto.',
            code,
            retryable: true,
        };
    }
    if (status === 413) return { message: 'Il file è troppo grande.', code, retryable: false };
    if (status === 401) return { message: 'Sessione scaduta. Ricarica la pagina e riprova.', code, retryable: false };
    if (status === 403) {
        if (code === 'APP_CHECK_FAILED') {
            // A transient security token problem, not a permission one: a retry
            // fetches a fresh token.
            return { message: 'Verifica di sicurezza non riuscita. Riprova.', code, retryable: true };
        }
        return {
            message: shown ?? 'Non hai i permessi per caricare file in questo progetto.',
            code,
            retryable: false,
        };
    }
    if (status === 400 || status === 415 || status === 422) {
        return { message: 'File non valido o non supportato.', code, retryable: false };
    }
    return { ...GENERIC, code };
}

/** The request never got a response (offline, DNS, CORS, dropped connection). */
export function networkUploadFailure(): UploadFailure {
    return { message: 'Connessione interrotta. Controlla la rete e riprova.', retryable: true };
}

/** Carries an `UploadFailure` through a rejected promise. */
export class UploadError extends Error {
    readonly failure: UploadFailure;

    constructor(failure: UploadFailure) {
        super(failure.message);
        this.name = 'UploadError';
        this.failure = failure;
    }
}
