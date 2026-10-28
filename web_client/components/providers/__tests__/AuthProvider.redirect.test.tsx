import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { onAuthStateChanged, onIdTokenChanged, type User } from 'firebase/auth';
import { AuthProvider, completeRedirectLogin, useAuthContext } from '../AuthProvider';
import { setAuthCookie } from '@/app/actions/auth-session';
import * as guestClaim from '@/lib/auth/guest-claim';
import * as redirectLogin from '@/lib/auth/redirect-login';

jest.mock('firebase/auth', () => ({
    onAuthStateChanged: jest.fn(() => jest.fn()),
    onIdTokenChanged: jest.fn(() => jest.fn()),
    signInAnonymously: jest.fn(),
    GoogleAuthProvider: jest.fn(),
    signOut: jest.fn(),
    sendSignInLinkToEmail: jest.fn(),
    isSignInWithEmailLink: jest.fn(() => true),
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
// Every login path brings the guest's chats along: lib/auth/guest-claim.ts (own tests).
jest.mock('@/lib/auth/guest-claim', () => ({
    popupKeepingGuestChats: jest.fn(),
    redirectKeepingGuestChats: jest.fn(),
    finishRedirectKeepingGuestChats: jest.fn(),
    signInKeepingGuestChats: jest.fn((signIn: () => Promise<unknown>) => signIn()),
}));
jest.mock('@/lib/auth/redirect-login', () => ({
    ...jest.requireActual('@/lib/auth/redirect-login'),
    shouldRedirectFirst: jest.fn(() => false),
    canRedirectHere: jest.fn(() => false),
}));

const mockPopup = guestClaim.popupKeepingGuestChats as jest.Mock;
const mockRedirect = guestClaim.redirectKeepingGuestChats as jest.Mock;
const mockFinish = guestClaim.finishRedirectKeepingGuestChats as jest.Mock;
const mockSignInKeeping = guestClaim.signInKeepingGuestChats as jest.Mock;
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
        mockPopup.mockResolvedValue(undefined);
        const ctx = await renderAuthReady();
        await expect(ctx().loginWithGoogle()).resolves.toBe('done');
        expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('redirects on phones, keeping no guest data in the browser', async () => {
        mockRedirectFirst.mockReturnValue(true);
        const ctx = await renderAuthReady();

        await expect(ctx().loginWithGoogle()).resolves.toBe('redirecting');

        expect(mockPopup).not.toHaveBeenCalled();
        expect(mockRedirect).toHaveBeenCalled();
        expect(redirectLogin.takePendingRedirect()).toBe(true);
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

describe('a guest linked to a new account', () => {
    it('becomes the registered user in context and cookie, though the uid did not change', async () => {
        // Firebase upgrades the linked user in place and onAuthStateChanged stays silent.
        const user = { uid: 'anon-1', isAnonymous: true, getIdToken: jest.fn(async () => 'registered-token') };
        let authChanged: (u: unknown) => Promise<void> = async () => {};
        let tokenChanged: (u: unknown) => Promise<void> = async () => {};
        (onAuthStateChanged as jest.Mock).mockImplementation((_auth, cb) => { authChanged = cb; return jest.fn(); });
        (onIdTokenChanged as jest.Mock).mockImplementation((_auth, cb) => { tokenChanged = cb; return jest.fn(); });
        const ctx = await renderAuthReady();
        await act(async () => { await authChanged(user); });
        expect(ctx().isAnonymous).toBe(true);

        user.isAnonymous = false; // linkWithPopup / linkWithCredential
        await act(async () => { await tokenChanged(user); });

        expect(ctx().isAnonymous).toBe(false);
        expect((ctx().user as User).uid).toBe('anon-1');
        expect(setAuthCookie).toHaveBeenLastCalledWith('registered-token');
    });
});

describe('magic link', () => {
    it('keeps the guest chats', async () => {
        const ctx = await renderAuthReady();
        await ctx().completeMagicLink('https://x/auth/verify?oobCode=1', 'u@test.com');
        expect(mockSignInKeeping).toHaveBeenCalled();
    });
});

describe('completeRedirectLogin', () => {
    it('does nothing when no redirect was started', async () => {
        await completeRedirectLogin();
        expect(mockFinish).not.toHaveBeenCalled();
    });

    it('finishes the login, guest chats included', async () => {
        redirectLogin.savePendingRedirect();
        mockFinish.mockResolvedValue(true);

        await completeRedirectLogin();

        expect(mockFinish).toHaveBeenCalled();
    });

    it('tells the user why the login failed', async () => {
        redirectLogin.savePendingRedirect();
        mockFinish.mockRejectedValue({ code: 'auth/account-exists-with-different-credential' });
        const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        await completeRedirectLogin();

        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('metodo usato la prima volta'));
    });

    it('runs at startup', async () => {
        redirectLogin.savePendingRedirect();
        mockFinish.mockResolvedValue(false);
        await act(async () => {
            renderAuth();
        });
        await waitFor(() => expect(mockFinish).toHaveBeenCalled());
    });
});
