import React from 'react';
import { act, render } from '@testing-library/react';
import { onAuthStateChanged, onIdTokenChanged, signInAnonymously, signOut, type User } from 'firebase/auth';
import { AuthProvider, useAuthContext } from '../AuthProvider';

jest.mock('firebase/auth', () => ({
    onAuthStateChanged: jest.fn(() => jest.fn()),
    onIdTokenChanged: jest.fn(() => jest.fn()),
    signInAnonymously: jest.fn(),
    GoogleAuthProvider: jest.fn(),
    signOut: jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({
    auth: { currentUser: null },
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
jest.mock('@/lib/auth/guest-claim', () => ({
    popupKeepingGuestChats: jest.fn(),
    redirectKeepingGuestChats: jest.fn(),
    finishRedirectKeepingGuestChats: jest.fn(),
    signInKeepingGuestChats: jest.fn((signIn: () => Promise<unknown>) => signIn()),
}));

const mockOnAuthStateChanged = onAuthStateChanged as unknown as jest.Mock;
const mockSignOut = signOut as unknown as jest.Mock;
const mockSignInAnonymously = signInAnonymously as unknown as jest.Mock;

const NOW_SECONDS = Math.floor(Date.now() / 1000);

/** A JWT-shaped token: the signature is irrelevant, only the payload is read (UX hint). */
function makeToken(claims: Record<string, unknown>): string {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${encode({ alg: 'none' })}.${encode(claims)}.sig`;
}

function fakeUser(token: string, isAnonymous: boolean): User {
    return {
        uid: 'u1',
        isAnonymous,
        getIdToken: jest.fn().mockResolvedValue(token),
    } as unknown as User;
}

/** Render, then let Firebase publish `user` through onAuthStateChanged, as on a real page. */
async function renderWithUser(user: User | null) {
    mockOnAuthStateChanged.mockImplementation((_auth: unknown, next: (u: User | null) => void) => {
        void next(user);
        return jest.fn();
    });
    let ctx: ReturnType<typeof useAuthContext> | undefined;
    function Probe() {
        ctx = useAuthContext();
        return null;
    }
    await act(async () => {
        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>,
        );
    });
    return () => ctx!;
}

const VALID_EXP = NOW_SECONDS + 3600;
const EXPIRED_EXP = NOW_SECONDS - 3600;
const REGISTERED = { firebase: { sign_in_provider: 'password' } };

beforeEach(() => {
    jest.clearAllMocks();
    mockSignOut.mockResolvedValue(undefined);
    mockSignInAnonymously.mockResolvedValue(undefined);
});

describe('AuthProvider isAdmin (UX hint only, the backend enforces the role)', () => {
    it('is true for a registered user whose valid token carries role=admin', async () => {
        const token = makeToken({ exp: VALID_EXP, role: 'admin', ...REGISTERED });
        const ctx = await renderWithUser(fakeUser(token, false));
        expect(ctx().isAdmin).toBe(true);
    });

    it('is false for a registered user without the admin role', async () => {
        const token = makeToken({ exp: VALID_EXP, ...REGISTERED });
        const ctx = await renderWithUser(fakeUser(token, false));
        expect(ctx().isAdmin).toBe(false);
    });

    it('is false for any other role value', async () => {
        const token = makeToken({ exp: VALID_EXP, role: 'editor', ...REGISTERED });
        const ctx = await renderWithUser(fakeUser(token, false));
        expect(ctx().isAdmin).toBe(false);
    });

    it('is false when the admin token has expired (same rule as the proxy)', async () => {
        const token = makeToken({ exp: EXPIRED_EXP, role: 'admin', ...REGISTERED });
        const ctx = await renderWithUser(fakeUser(token, false));
        expect(ctx().isAdmin).toBe(false);
    });

    it('is false when the token is malformed', async () => {
        const ctx = await renderWithUser(fakeUser('not-a-jwt', false));
        expect(ctx().isAdmin).toBe(false);
    });

    it('is false for an anonymous user even if the token says admin', async () => {
        const token = makeToken({ exp: VALID_EXP, role: 'admin', firebase: { sign_in_provider: 'anonymous' } });
        const ctx = await renderWithUser(fakeUser(token, true));
        expect(ctx().isAdmin).toBe(false);
    });

    it('is false when nobody is signed in', async () => {
        const ctx = await renderWithUser(null);
        expect(ctx().isAdmin).toBe(false);
    });

    it('goes back to false right after logout', async () => {
        const token = makeToken({ exp: VALID_EXP, role: 'admin', ...REGISTERED });
        const ctx = await renderWithUser(fakeUser(token, false));
        expect(ctx().isAdmin).toBe(true);

        await act(async () => {
            await ctx().logout();
        });

        expect(ctx().isAdmin).toBe(false);
    });
});
