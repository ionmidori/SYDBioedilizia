import { renderHook, act } from '@testing-library/react';
import { usePasskey } from '../usePasskey';
import {
    clearDevicePasskey,
    hasDevicePasskey,
    markDevicePasskey,
    PASSKEY_NOT_ENROLLED_MESSAGE,
} from '@/lib/auth/passkey-device';

/**
 * Regression test for the response-shape bug: python-fido2 wraps registration
 * and authentication options under a `publicKey` key
 * (backend_python/src/api/routes/passkey.py returns `dict(options)` on a
 * CredentialCreationOptions/CredentialRequestOptions). The hook used to read
 * the options flat, which threw a TypeError before the biometric prompt ever
 * appeared. These tests assert the unwrap + ArrayBuffer conversion.
 */

type MockUser = { uid: string } | null;
let mockUser: MockUser = null;
let mockIdToken: string | null = null;
jest.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ user: mockUser, idToken: mockIdToken }),
}));

const mockFetchWithAuth = jest.fn();
jest.mock('@/lib/api-client', () => ({
    fetchWithAuth: (...args: unknown[]) => mockFetchWithAuth(...args),
}));

jest.mock('firebase/auth', () => ({
    signInWithCustomToken: jest.fn(),
}));
jest.mock('@/lib/firebase', () => ({
    auth: {},
}));

function b64url(input: string): string {
    return Buffer.from(input).toString('base64url');
}

function jsonResponse(body: unknown, ok = true): Response {
    return {
        ok,
        json: async () => body,
    } as Response;
}

describe('usePasskey — response shape regression', () => {
    beforeEach(() => {
        mockUser = { uid: 'user-1' };
        mockIdToken = 'token-1';
        // Base fallback for the checkHasPasskeys() call that registerPasskey
        // fires after a successful verify; each test overrides the calls it
        // cares about with mockResolvedValueOnce (which takes priority).
        mockFetchWithAuth.mockReset().mockResolvedValue(jsonResponse({ has_passkeys: true }));
    });

    it('unwraps publicKey and converts challenge/user.id to ArrayBuffer on register', async () => {
        const wireOptions = {
            publicKey: {
                challenge: b64url('challenge-bytes'),
                rp: { id: 'localhost', name: 'SYD' },
                user: { id: b64url('user-1'), name: 'user-1', displayName: 'SYD User' },
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
            },
        };

        mockFetchWithAuth
            .mockResolvedValueOnce(jsonResponse(wireOptions))
            .mockResolvedValueOnce(jsonResponse({ success: true, message: 'ok' }));

        const mockCredential = {
            id: 'cred-id',
            rawId: new Uint8Array([1, 2, 3]).buffer,
            type: 'public-key',
            response: {
                attestationObject: new Uint8Array([4, 5, 6]).buffer,
                clientDataJSON: new Uint8Array([7, 8, 9]).buffer,
            },
        };
        const createSpy = jest.fn().mockResolvedValue(mockCredential);
        Object.defineProperty(global.navigator, 'credentials', {
            value: { create: createSpy, get: jest.fn() },
            configurable: true,
        });

        const { result } = renderHook(() => usePasskey());

        await act(async () => {
            await result.current.registerPasskey();
        });

        expect(createSpy).toHaveBeenCalledTimes(1);
        const passedPublicKey = createSpy.mock.calls[0][0].publicKey;
        expect(passedPublicKey.challenge).toBeInstanceOf(ArrayBuffer);
        expect(passedPublicKey.user.id).toBeInstanceOf(ArrayBuffer);
        expect(Buffer.from(passedPublicKey.challenge).toString()).toBe('challenge-bytes');
        expect(Buffer.from(passedPublicKey.user.id).toString()).toBe('user-1');
    });

    it('converts excludeCredentials[].id to ArrayBuffer when the user already has a passkey', async () => {
        const wireOptions = {
            publicKey: {
                challenge: b64url('challenge-bytes'),
                rp: { id: 'localhost', name: 'SYD' },
                user: { id: b64url('user-1'), name: 'user-1', displayName: 'SYD User' },
                excludeCredentials: [{ type: 'public-key', id: b64url('existing-cred') }],
            },
        };

        mockFetchWithAuth
            .mockResolvedValueOnce(jsonResponse(wireOptions))
            .mockResolvedValueOnce(jsonResponse({ success: true, message: 'ok' }));

        const createSpy = jest.fn().mockResolvedValue({
            id: 'cred-id',
            rawId: new Uint8Array([1]).buffer,
            type: 'public-key',
            response: {
                attestationObject: new Uint8Array([1]).buffer,
                clientDataJSON: new Uint8Array([1]).buffer,
            },
        });
        Object.defineProperty(global.navigator, 'credentials', {
            value: { create: createSpy, get: jest.fn() },
            configurable: true,
        });

        const { result } = renderHook(() => usePasskey());

        await act(async () => {
            await result.current.registerPasskey();
        });

        const passedPublicKey = createSpy.mock.calls[0][0].publicKey;
        expect(passedPublicKey.excludeCredentials).toHaveLength(1);
        expect(passedPublicKey.excludeCredentials[0].id).toBeInstanceOf(ArrayBuffer);
        expect(Buffer.from(passedPublicKey.excludeCredentials[0].id).toString()).toBe('existing-cred');
    });

    it('propagates the backend detail message when /register/verify fails', async () => {
        const wireOptions = {
            publicKey: {
                challenge: b64url('challenge-bytes'),
                rp: { id: 'localhost', name: 'SYD' },
                user: { id: b64url('user-1'), name: 'user-1', displayName: 'SYD User' },
            },
        };
        mockFetchWithAuth
            .mockResolvedValueOnce(jsonResponse(wireOptions))
            .mockResolvedValueOnce(jsonResponse({ detail: 'Challenge expired or invalid' }, false));

        Object.defineProperty(global.navigator, 'credentials', {
            value: {
                create: jest.fn().mockResolvedValue({
                    id: 'cred-id',
                    rawId: new Uint8Array([1]).buffer,
                    type: 'public-key',
                    response: {
                        attestationObject: new Uint8Array([1]).buffer,
                        clientDataJSON: new Uint8Array([1]).buffer,
                    },
                }),
                get: jest.fn(),
            },
            configurable: true,
        });

        const { result } = renderHook(() => usePasskey());

        await expect(
            act(async () => {
                await result.current.registerPasskey();
            })
        ).rejects.toThrow('Challenge expired or invalid');
    });

    it('unwraps publicKey and converts challenge/allowCredentials on authenticate', async () => {
        markDevicePasskey(); // device enrolled from the profile
        const wireOptions = {
            publicKey: {
                challenge: b64url('auth-challenge'),
                allowCredentials: [{ type: 'public-key', id: b64url('cred-a') }],
            },
        };

        mockFetchWithAuth
            .mockResolvedValueOnce(jsonResponse(wireOptions))
            .mockResolvedValueOnce(jsonResponse({ token: null }));

        const getSpy = jest.fn().mockResolvedValue({
            id: 'cred-a',
            rawId: new Uint8Array([1]).buffer,
            type: 'public-key',
            response: {
                authenticatorData: new Uint8Array([1]).buffer,
                clientDataJSON: new Uint8Array([1]).buffer,
                signature: new Uint8Array([1]).buffer,
                userHandle: null,
            },
        });
        Object.defineProperty(global.navigator, 'credentials', {
            value: { create: jest.fn(), get: getSpy },
            configurable: true,
        });

        const { result } = renderHook(() => usePasskey());

        await act(async () => {
            await result.current.authenticateWithPasskey();
        });

        const passedPublicKey = getSpy.mock.calls[0][0].publicKey;
        expect(passedPublicKey.challenge).toBeInstanceOf(ArrayBuffer);
        expect(Buffer.from(passedPublicKey.challenge).toString()).toBe('auth-challenge');
        expect(passedPublicKey.allowCredentials[0].id).toBeInstanceOf(ArrayBuffer);
    });
});

/**
 * Runs `fn` inside act() and returns what it rejected with. Used instead of
 * `expect(act(...)).rejects` because that form resolves before the async callback
 * has finished, so assertions placed after it would race the hook's side effects.
 */
async function rejectionOf(fn: () => Promise<unknown>): Promise<Error | undefined> {
    try {
        await act(async () => {
            await fn();
        });
    } catch (e) {
        return e as Error;
    }
    return undefined;
}

describe('usePasskey — per-device enrolment gate', () => {
    beforeEach(() => {
        mockUser = { uid: 'user-1' };
        mockIdToken = 'token-1';
        mockFetchWithAuth.mockReset().mockResolvedValue(jsonResponse({ has_passkeys: true }));
        clearDevicePasskey();
    });

    it('refuses biometric login on a device where it was never activated, without any network/WebAuthn call', async () => {
        const getSpy = jest.fn();
        Object.defineProperty(global.navigator, 'credentials', {
            value: { create: jest.fn(), get: getSpy },
            configurable: true,
        });
        const { result } = renderHook(() => usePasskey());

        const err = await rejectionOf(() => result.current.authenticateWithPasskey());
        expect(err?.message).toBe(PASSKEY_NOT_ENROLLED_MESSAGE);

        expect(mockFetchWithAuth).not.toHaveBeenCalled();
        expect(getSpy).not.toHaveBeenCalled();
    });

    it('marks the device as enrolled after a successful registration from the profile', async () => {
        mockFetchWithAuth
            .mockResolvedValueOnce(jsonResponse({ publicKey: {
                challenge: b64url('c'),
                user: { id: b64url('user-1'), name: 'u', displayName: 'U' },
            } }))
            .mockResolvedValueOnce(jsonResponse({ success: true }));
        Object.defineProperty(global.navigator, 'credentials', {
            value: {
                create: jest.fn().mockResolvedValue({
                    id: 'cred-id',
                    rawId: new Uint8Array([1]).buffer,
                    type: 'public-key',
                    response: {
                        attestationObject: new Uint8Array([1]).buffer,
                        clientDataJSON: new Uint8Array([1]).buffer,
                    },
                }),
                get: jest.fn(),
            },
            configurable: true,
        });
        const { result } = renderHook(() => usePasskey());
        expect(hasDevicePasskey()).toBe(false);

        await act(async () => {
            await result.current.registerPasskey();
        });

        expect(hasDevicePasskey()).toBe(true);
    });

    it('treats InvalidStateError (iCloud Keychain already holds the passkey) as enrolled', async () => {
        mockFetchWithAuth.mockResolvedValueOnce(jsonResponse({ publicKey: {
            challenge: b64url('c'),
            user: { id: b64url('user-1'), name: 'u', displayName: 'U' },
        } }));
        const invalidState = Object.assign(new Error('exists'), { name: 'InvalidStateError' });
        Object.defineProperty(global.navigator, 'credentials', {
            value: { create: jest.fn().mockRejectedValue(invalidState), get: jest.fn() },
            configurable: true,
        });
        const { result } = renderHook(() => usePasskey());

        const err = await rejectionOf(() => result.current.registerPasskey());
        expect(err?.message).toMatch(/già attiva/);
        expect(hasDevicePasskey()).toBe(true);
    });

    it('clears the device marker when the backend no longer recognises the credential (404)', async () => {
        markDevicePasskey();
        mockFetchWithAuth
            .mockResolvedValueOnce(jsonResponse({ publicKey: { challenge: b64url('c') } }))
            .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response);
        Object.defineProperty(global.navigator, 'credentials', {
            value: {
                create: jest.fn(),
                get: jest.fn().mockResolvedValue({
                    id: 'x',
                    rawId: new Uint8Array([1]).buffer,
                    type: 'public-key',
                    response: {
                        authenticatorData: new Uint8Array([1]).buffer,
                        clientDataJSON: new Uint8Array([1]).buffer,
                        signature: new Uint8Array([1]).buffer,
                        userHandle: null,
                    },
                }),
            },
            configurable: true,
        });
        const { result } = renderHook(() => usePasskey());

        const err = await rejectionOf(() => result.current.authenticateWithPasskey());
        expect(err?.message).toBe('Authentication failed');
        expect(hasDevicePasskey()).toBe(false);
    });
});
