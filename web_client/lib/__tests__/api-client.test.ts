import { getToken } from 'firebase/app-check';
import { z } from 'zod';
import { describeApiError, fetchValidated, fetchWithAuth } from '../api-client';

jest.mock('@/lib/firebase', () => ({
    // Mutable holder: tests swap currentUser / appCheck per scenario.
    auth: { currentUser: null },
    appCheck: null,
}));

jest.mock('firebase/app-check', () => ({
    getToken: jest.fn(),
}));

const firebase = jest.requireMock('@/lib/firebase') as {
    auth: { currentUser: { getIdToken: () => Promise<string> } | null };
    appCheck: object | null;
};
const mockGetToken = getToken as jest.Mock;
const fetchMock = global.fetch as jest.Mock;

/** Minimal Response stand-in. Pass a thrown json to simulate a non-JSON body. */
function res(body: unknown, init: { ok?: boolean; status?: number; jsonFails?: boolean } = {}) {
    return {
        ok: init.ok ?? true,
        status: init.status ?? 200,
        json: init.jsonFails
            ? () => Promise.reject(new SyntaxError('not json'))
            : () => Promise.resolve(body),
    } as unknown as Response;
}

function sentHeaders(): Record<string, string> {
    return fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1].headers;
}

const ORIGINAL_APP_CHECK_ENV = process.env.NEXT_PUBLIC_ENABLE_APP_CHECK;

describe('fetchWithAuth', () => {
    beforeEach(() => {
        fetchMock.mockReset();
        fetchMock.mockResolvedValue(res({}));
        mockGetToken.mockReset();
        firebase.auth.currentUser = null;
        firebase.appCheck = null;
        delete process.env.NEXT_PUBLIC_ENABLE_APP_CHECK;
    });

    afterAll(() => {
        process.env.NEXT_PUBLIC_ENABLE_APP_CHECK = ORIGINAL_APP_CHECK_ENV;
    });

    it('sends no Authorization header when no user is signed in', async () => {
        await fetchWithAuth('/api/py/projects');
        expect(sentHeaders()).not.toHaveProperty('Authorization');
    });

    it('always disables caching (Next.js/Vercel buffering guard)', async () => {
        await fetchWithAuth('/api/py/projects');
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/py/projects',
            expect.objectContaining({ cache: 'no-store' })
        );
    });

    it('injects the Firebase ID token as a Bearer header', async () => {
        firebase.auth.currentUser = { getIdToken: () => Promise.resolve('tok-123') };
        await fetchWithAuth('/api/py/projects');
        expect(sentHeaders()).toHaveProperty('Authorization', 'Bearer tok-123');
    });

    it('still performs the request when getIdToken fails', async () => {
        firebase.auth.currentUser = { getIdToken: () => Promise.reject(new Error('expired')) };
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await fetchWithAuth('/api/py/projects');

        expect(fetchMock).toHaveBeenCalled();
        expect(sentHeaders()).not.toHaveProperty('Authorization');
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('skipAuth suppresses token injection even with a signed-in user', async () => {
        const getIdToken = jest.fn();
        firebase.auth.currentUser = { getIdToken };
        await fetchWithAuth('/api/py/public', { skipAuth: true });
        expect(getIdToken).not.toHaveBeenCalled();
        expect(sentHeaders()).not.toHaveProperty('Authorization');
    });

    it.each([
        ['a Headers instance', new Headers({ 'x-custom': '1' })],
        ['a tuple array', [['x-custom', '1']] as [string, string][]],
        ['a plain object', { 'x-custom': '1' }],
    ])('preserves caller headers given as %s', async (_label, headers) => {
        await fetchWithAuth('/api/py/projects', { headers });
        expect(sentHeaders()).toHaveProperty('x-custom', '1');
    });

    it('warns on a 401 response and returns it to the caller', async () => {
        fetchMock.mockResolvedValue(res({}, { ok: false, status: 401 }));
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const response = await fetchWithAuth('/api/py/projects');

        expect(response.status).toBe(401);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('401'));
        warnSpy.mockRestore();
    });

    describe('App Check (NEXT_PUBLIC_ENABLE_APP_CHECK=true)', () => {
        beforeEach(() => {
            process.env.NEXT_PUBLIC_ENABLE_APP_CHECK = 'true';
        });

        it('injects the App Check token header', async () => {
            firebase.appCheck = {};
            mockGetToken.mockResolvedValue({ token: 'ac-token' });
            await fetchWithAuth('/api/py/projects');
            expect(sentHeaders()).toHaveProperty('X-Firebase-AppCheck', 'ac-token');
        });

        it('logs and skips injection when the appCheck instance is null', async () => {
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            await fetchWithAuth('/api/py/projects');
            expect(sentHeaders()).not.toHaveProperty('X-Firebase-AppCheck');
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Header Injection Blocked'));
            errorSpy.mockRestore();
        });

        it('warns on an empty token and does not set the header', async () => {
            firebase.appCheck = {};
            mockGetToken.mockResolvedValue({ token: '' });
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            await fetchWithAuth('/api/py/projects');
            expect(sentHeaders()).not.toHaveProperty('X-Firebase-AppCheck');
            expect(warnSpy).toHaveBeenCalled();
            warnSpy.mockRestore();
        });

        it('survives a getToken failure', async () => {
            firebase.appCheck = {};
            mockGetToken.mockRejectedValue(new Error('recaptcha down'));
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            await fetchWithAuth('/api/py/projects');
            expect(fetchMock).toHaveBeenCalled();
            errorSpy.mockRestore();
        });

        it('retries once with a forced refresh before giving up', async () => {
            firebase.appCheck = {};
            mockGetToken
                .mockRejectedValueOnce(new Error('first try'))
                .mockResolvedValueOnce({ token: 'ac-retry' });
            jest.spyOn(console, 'error').mockImplementation(() => {});
            await fetchWithAuth('/api/py/projects');
            expect(mockGetToken).toHaveBeenNthCalledWith(2, firebase.appCheck, true);
            expect(sentHeaders()).toHaveProperty('X-Firebase-AppCheck', 'ac-retry');
            expect(sentHeaders()).not.toHaveProperty('X-AppCheck-Error');
        });

        it('tells the backend why the token is missing (diagnosis on iPhone)', async () => {
            firebase.appCheck = {};
            mockGetToken.mockRejectedValue(
                Object.assign(new Error('throttled'), { code: 'appCheck/throttled' })
            );
            jest.spyOn(console, 'error').mockImplementation(() => {});
            await fetchWithAuth('/api/py/projects');
            expect(sentHeaders()).toHaveProperty('X-AppCheck-Error', 'appCheck/throttled');
        });

        it('reports a missing App Check instance to the backend', async () => {
            jest.spyOn(console, 'error').mockImplementation(() => {});
            await fetchWithAuth('/api/py/projects');
            expect(sentHeaders()).toHaveProperty('X-AppCheck-Error', 'no-instance');
        });
    });
});

describe('describeApiError', () => {
    it('turns an App Check rejection into a readable Italian message', () => {
        const msg = describeApiError({ error_code: 'APP_CHECK_FAILED', message: 'Missing App Check token' });
        expect(msg).not.toMatch(/App Check/);
        expect(msg).toMatch(/verifica di sicurezza/i);
    });

    it('keeps other backend messages', () => {
        expect(describeApiError({ error_code: 'NOT_FOUND', message: 'Progetto non trovato' }))
            .toBe('Progetto non trovato');
    });

    it('falls back for unknown shapes', () => {
        expect(describeApiError(undefined)).toBe('Errore di caricamento. Riprova.');
    });
});

describe('fetchValidated', () => {
    const schema = z.object({ id: z.string() });

    beforeEach(() => {
        fetchMock.mockReset();
        firebase.auth.currentUser = null;
        firebase.appCheck = null;
        delete process.env.NEXT_PUBLIC_ENABLE_APP_CHECK;
    });

    it('returns the parsed payload on success', async () => {
        fetchMock.mockResolvedValue(res({ id: 'abc', extra: 'stripped' }));
        await expect(fetchValidated('/api/py/x', schema)).resolves.toEqual({ id: 'abc' });
    });

    it('throws a structured VALIDATION_ERROR when the payload does not match', async () => {
        fetchMock.mockResolvedValue(res({ id: 42 }));
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await expect(fetchValidated('/api/py/x', schema)).rejects.toMatchObject({
            error_code: 'VALIDATION_ERROR',
        });
        errorSpy.mockRestore();
    });

    it('rethrows the backend error body on a non-ok response', async () => {
        fetchMock.mockResolvedValue(res({ detail: 'Not found' }, { ok: false, status: 404 }));
        await expect(fetchValidated('/api/py/x', schema)).rejects.toEqual({ detail: 'Not found' });
    });

    it('falls back to a generic error when the error body is not JSON', async () => {
        fetchMock.mockResolvedValue(res(null, { ok: false, status: 502, jsonFails: true }));
        await expect(fetchValidated('/api/py/x', schema)).rejects.toEqual({
            message: 'Network response was not ok',
            status: 502,
        });
    });
});
