import { networkUploadFailure, parseUploadError, UploadError } from '../upload-error';

const body = (payload: unknown) => JSON.stringify(payload);

describe('parseUploadError', () => {
    describe('quota exceeded (429 QUOTA_EXCEEDED)', () => {
        const quota = body({
            error_code: 'QUOTA_EXCEEDED',
            message: 'Hai raggiunto il limite giornaliero di caricamenti video. Riprova domani dopo le 09:10.',
            detail: { tool_name: 'upload_video', reset_at: '2026-10-17T07:10:00+00:00', period: 'daily' },
        });

        it('shows the backend message, which says when to retry', () => {
            const failure = parseUploadError(429, quota);
            expect(failure.message).toBe(
                'Hai raggiunto il limite giornaliero di caricamenti video. Riprova domani dopo le 09:10.'
            );
            expect(failure.code).toBe('QUOTA_EXCEEDED');
        });

        it('is not retryable: trying again cannot help before the reset', () => {
            expect(parseUploadError(429, quota).retryable).toBe(false);
        });

        it('falls back to a generic message when the body has none', () => {
            const failure = parseUploadError(429, body({ error_code: 'QUOTA_EXCEEDED' }));
            expect(failure.message).toMatch(/limite/i);
            expect(failure.retryable).toBe(false);
        });
    });

    describe('quota service unavailable (503 QUOTA_UNAVAILABLE)', () => {
        it('shows the backend message and allows a retry', () => {
            const failure = parseUploadError(
                503,
                body({ error_code: 'QUOTA_UNAVAILABLE', message: 'Verifica della quota momentaneamente non disponibile. Riprova tra qualche minuto.' })
            );
            expect(failure.message).toBe('Verifica della quota momentaneamente non disponibile. Riprova tra qualche minuto.');
            expect(failure.code).toBe('QUOTA_UNAVAILABLE');
            expect(failure.retryable).toBe(true);
        });
    });

    describe('feature not available for the account (403 FEATURE_NOT_AVAILABLE)', () => {
        it('shows the backend message and offers no retry', () => {
            const failure = parseUploadError(
                403,
                body({ error_code: 'FEATURE_NOT_AVAILABLE', message: 'Questa funzione non è disponibile per il tuo account.' })
            );
            expect(failure.message).toBe('Questa funzione non è disponibile per il tuo account.');
            expect(failure.retryable).toBe(false);
        });
    });

    describe('App Check (403 APP_CHECK_FAILED)', () => {
        it('is a transient security check, not a permission problem: retryable', () => {
            const failure = parseUploadError(403, body({ error_code: 'APP_CHECK_FAILED', message: 'Invalid App Check token' }));
            expect(failure.message).toMatch(/verifica di sicurezza/i);
            expect(failure.message).not.toMatch(/permessi/i);
            expect(failure.retryable).toBe(true);
        });
    });

    describe('other statuses', () => {
        it('429 without a quota code is a rate limit, retryable', () => {
            const failure = parseUploadError(429, body({ error: 'Rate limit exceeded: 20 per 1 minute' }));
            expect(failure.message).toBe('Troppe richieste. Riprova tra poco.');
            expect(failure.retryable).toBe(true);
        });

        it.each([
            [413, /troppo grande/i, false],
            [401, /sessione scaduta/i, false],
            [403, /permessi/i, false],
            [422, /non valido|non supportato/i, false],
            [503, /momentaneamente non disponibile/i, true],
            [500, /non riuscito/i, true],
            [502, /non riuscito/i, true],
        ])('maps %i to an Italian message', (status, message, retryable) => {
            const failure = parseUploadError(status, body({ detail: 'English backend text' }));
            expect(failure.message).toMatch(message);
            expect(failure.retryable).toBe(retryable);
        });

        it('never shows backend text that is not meant for users', () => {
            const failure = parseUploadError(
                500,
                body({ error_code: 'INTERNAL_SERVER_ERROR', message: 'An internal server error occurred.' })
            );
            expect(failure.message).not.toMatch(/internal server error/i);
        });

        it('ignores the body message of codes that are not quota codes', () => {
            const failure = parseUploadError(403, body({ error_code: 'PERMISSION_DENIED', message: 'Questa sessione appartiene a un altro utente.' }));
            expect(failure.message).toMatch(/permessi/i);
        });
    });

    describe('unreadable bodies', () => {
        it.each(['', 'not json', '<html>502 Bad Gateway</html>', 'null', '[]', '"text"'])(
            'handles %j without throwing',
            (text) => {
                expect(() => parseUploadError(500, text)).not.toThrow();
                expect(parseUploadError(500, text).retryable).toBe(true);
                expect(parseUploadError(429, text).retryable).toBe(true);
            }
        );

        it('does not trust a non-string message', () => {
            const failure = parseUploadError(429, body({ error_code: 'QUOTA_EXCEEDED', message: { evil: true } }));
            expect(typeof failure.message).toBe('string');
            expect(failure.message).toMatch(/limite/i);
        });
    });
});

describe('networkUploadFailure', () => {
    it('is retryable and tells the user to check the connection', () => {
        const failure = networkUploadFailure();
        expect(failure.retryable).toBe(true);
        expect(failure.message).toMatch(/connessione/i);
    });
});

describe('UploadError', () => {
    it('is an Error that carries the failure', () => {
        const failure = parseUploadError(413, '');
        const error = new UploadError(failure);
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe(failure.message);
        expect(error.failure).toBe(failure);
        expect(error.name).toBe('UploadError');
    });
});
