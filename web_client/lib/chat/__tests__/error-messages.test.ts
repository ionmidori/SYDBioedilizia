import { mapErrorToMessage } from '../error-messages';

describe('mapErrorToMessage', () => {
    it.each([
        ['429 Too Many Requests', false],
        ['Quota exceeded for this project', false],
        ['Rate limit hit', false],
    ])('maps quota/rate-limit errors ("%s") to a non-retryable friendly message', (raw, retryable) => {
        const result = mapErrorToMessage(raw);
        expect(result).toEqual({
            message: 'Hai raggiunto il limite di richieste. Riprova tra qualche minuto.',
            retryable,
        });
    });

    it.each([
        ['401 Unauthorized', false],
        ['Auth token expired', false],
    ])('maps auth errors ("%s") to a non-retryable session-expired message', (raw, retryable) => {
        const result = mapErrorToMessage(raw);
        expect(result).toEqual({
            message: 'Sessione scaduta. Ricarica la pagina per continuare.',
            retryable,
        });
    });

    it.each(['503 Service Unavailable', '502 Bad Gateway'])(
        'maps upstream outage errors ("%s") to a retryable message',
        (raw) => {
            const result = mapErrorToMessage(raw);
            expect(result).toEqual({
                message: 'Il servizio è temporaneamente non disponibile. Riprova tra poco.',
                retryable: true,
            });
        }
    );

    it('falls back to the raw message with retryable=true for unrecognized errors', () => {
        expect(mapErrorToMessage('Something exploded')).toEqual({
            message: 'Something exploded',
            retryable: true,
        });
    });

    it('falls back to a generic message when the raw message is empty/undefined', () => {
        expect(mapErrorToMessage(undefined)).toEqual({
            message: 'Si è verificato un errore. Riprova.',
            retryable: true,
        });
        expect(mapErrorToMessage('')).toEqual({
            message: 'Si è verificato un errore. Riprova.',
            retryable: true,
        });
    });

    it('shows the message of a JSON error body, never the raw JSON', () => {
        // The /api/chat proxy answers {error_code, message}; the AI SDK puts that
        // text in error.message.
        const raw = JSON.stringify({ error_code: 'BACKEND_ERROR', message: 'Errore del servizio.' });

        expect(mapErrorToMessage(raw)).toEqual({ message: 'Errore del servizio.', retryable: true });
    });

    it.each(['CHAT_MERGED', 'USER_CHAT_MISMATCH'])(
        'does not offer a retry for %s: the same chat id would be refused again',
        (code) => {
            const raw = JSON.stringify({ error_code: code, message: 'Ricarica la pagina per continuare.' });

            expect(mapErrorToMessage(raw)).toEqual({ message: 'Ricarica la pagina per continuare.', retryable: false });
        },
    );
});
