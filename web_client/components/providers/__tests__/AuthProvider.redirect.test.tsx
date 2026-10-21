import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { getRedirectResult, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { AuthProvider, completeRedirectLogin, useAuthContext } from '../AuthProvider';
import { projectsApi } from '@/lib/projects-api';
import * as redirectLogin from '@/lib/auth/redirect-login';

jest.mock('firebase/auth', () => ({
    onAuthStateChanged: jest.fn(() => jest.fn()),
    signInAnonymously: jest.fn(),
    signInWithPopup: jest.fn(),
    signInWithRedirect: jest.fn(),
    getRedirectResult: jest.fn(),
    GoogleAuthProvider: jest.fn(),
    signOut: jest.fn(),
    sendSignInLinkToEmail: jest.fn(),
    isSignInWithEmailLink: jest.fn(),
    signInWithEmailLink: jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({
    auth: { currentUser: { uid: 'anon-1', isAnonymous: true } },
    waitForAuth: () => Promise.resolve(),
}));
jest.mock('@/lib/auth/token-manager', () => ({
    tokenManager: {
        onRefresh: () => jest.fn(),
        onError: () => jest.fn(),
        startMonitoring: jest.fn(),
        stopMonitoring: jest.fn(),
    },
}));
jest.mock('@/app/actions/auth-session', () => ({ setAuthCookie: jest.fn(), removeAuthCookie: jest.fn() }));
jest.mock('@/lib/query-client', () => ({ queryClient: { clear: jest.fn() } }));
jest.mock('@/lib/projects-api', () => ({ projectsApi: { claimProject: jest.fn() } }));
jest.mock('@/lib/auth/redirect-login', () => ({
    ...jest.requireActual('@/lib/auth/redirect-login'),
    shouldRedirectFirst: jest.fn(() => false),
    canRedirectHere: jest.fn(() => false),
}));

const mockGetRedirectResult = getRedirectResult as jest.Mock;
const mockPopup = signInWithPopup as jest.Mock;
const mockRedirect = signInWithRedirect as jest.Mock;
const mockClaim = projectsApi.claimProject as jest.Mock;
const mockRedirectFirst = redirectLogin.shouldRedirectFirst as jest.Mock;
const mockCanRedirect = redirectLogin.canRedirectHere as jest.Mock;

function renderAuth() {
    let ctx: ReturnType<typeof useAuthContext> | undefined;
    function Probe() {
        ctx = useAuthContext();
        return null;
    }
    render(<AuthProvider><Probe /></AuthProvider>);
    return () => ctx!;
}

/** Render and let the startup work (redirect completion) finish, as on a real page. */
async function renderAuthReady() {
    let get: (() => ReturnType<typeof useAuthContext>) | undefined;
    await act(async () => {
        get = renderAuth();
    });
    return get!;
}

beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    mockRedirectFirst.mockReturnValue(false);
    mockCanRedirect.mockReturnValue(false);
});

describe('social login: popup or redirect', () => {
    it('keeps the popup on desktop', async () => {
        mockPopup.mockResolvedValue({});
        const ctx = await renderAuthReady();
        await expect(ctx().loginWithGoogle()).resolves.toBe('done');
        expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('redirects on phones and remembers the guest chat to claim', async () => {
        mockRedirectFirst.mockReturnValue(true);
        localStorage.setItem('chatSessionId', 'guest-1');
        const ctx = await renderAuthReady();

        await expect(ctx().loginWithGoogle({ redirectTo: '/dashboard' })).resolves.toBe('redirecting');

        expect(mockPopup).not.toHaveBeenCalled();
        expect(mockRedirect).toHaveBeenCalled();
        expect(redirectLogin.takePendingRedirect()).toEqual({ guestSessionId: 'guest-1', redirectTo: '/dashboard' });
    });

    it('falls back to redirect when the popup is refused', async () => {
        mockCanRedirect.mockReturnValue(true);
        mockPopup.mockRejectedValue({ code: 'auth/operation-not-supported-in-this-environment' });
        const ctx = await renderAuthReady();
        await expect(ctx().loginWithGoogle()).resolves.toBe('redirecting');
        expect(mockRedirect).toHaveBeenCalled();
    });

    it('rethrows a refused popup when redirect is not configured', async () => {
        mockPopup.mockRejectedValue({ code: 'auth/popup-blocked' });
        const ctx = await renderAuthReady();
        await expect(ctx().loginWithGoogle()).rejects.toEqual({ code: 'auth/popup-blocked' });
        expect(mockRedirect).not.toHaveBeenCalled();
    });
});

describe('completeRedirectLogin', () => {
    it('does nothing when no redirect was started', async () => {
        await completeRedirectLogin();
        expect(mockGetRedirectResult).not.toHaveBeenCalled();
    });

    it('claims the guest chat for the account that came back', async () => {
        redirectLogin.savePendingRedirect({ guestSessionId: 'guest-1', redirectTo: null });
        localStorage.setItem('chatSessionId', 'guest-1');
        mockGetRedirectResult.mockResolvedValue({ user: { uid: 'google-uid' } });
        mockClaim.mockResolvedValue({});

        await completeRedirectLogin();

        expect(mockClaim).toHaveBeenCalledWith('guest-1');
        expect(localStorage.getItem('chatSessionId')).toBeNull();
    });

    it('tells the user why the login failed', async () => {
        redirectLogin.savePendingRedirect({ guestSessionId: null, redirectTo: null });
        mockGetRedirectResult.mockRejectedValue({ code: 'auth/account-exists-with-different-credential' });
        const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        await completeRedirectLogin();

        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('metodo usato la prima volta'));
    });

    it('runs at startup', async () => {
        redirectLogin.savePendingRedirect({ guestSessionId: null, redirectTo: null });
        mockGetRedirectResult.mockResolvedValue(null);
        await act(async () => {
            renderAuth();
        });
        await waitFor(() => expect(mockGetRedirectResult).toHaveBeenCalled());
    });
});
