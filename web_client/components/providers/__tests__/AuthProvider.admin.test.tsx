import React from 'react';
import { act, render } from '@testing-library/react';
import { onAuthStateChanged, onIdTokenChanged, signInAnonymously, signOut, type User } from 'firebase/auth';
import { AuthProvider, useAuthContext } from '../AuthProvider';
import { tokenManager } from '@/lib/auth/token-manager';

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
        onRefresh: jest.fn(() => jest.fn()),
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
const mockOnIdTokenChanged = onIdTokenChanged as unknown as jest.Mock;
const mockOnRefresh = tokenManager.onRefresh as unknown as jest.Mock;
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
    mockOnIdTokenChanged.mockReturnValue(jest.fn());
    mockOnRefresh.mockReturnValue(jest.fn());
    mockSignOut.mockResolvedValue(undefined);
    mockSignInAnonymously.mockResolvedValue(undefined);
});

describe('AuthProvider isAdmin (UX hint only, the backend enforces the role)', () => {
    it('is true for a registered user whose valid token carries role=admin', async () => {
        const token = makeToken({ exp: VALID_EXP, role: 'admin', ...REGISTERED });
        const ctx = await renderWithUser(fakeUser(token, false));
        expect(ctx().isInitialized).toBe(true);
        expect(ctx().idToken).toBe(token);
        expect(ctx().isAdmin).toBe(true);
    });

    it('is false for a registered user without the admin role', async () => {
        const token = makeToken({ exp: VALID_EXP, ...REGISTERED });
        const ctx = await renderWithUser(fakeUser(token, false));
        expect(ctx().idToken).toBe(token);
        expect(ctx().isAdmin).toBe(false);
    });

    it('is false for any other role value', async () => {
        const token = makeToken({ exp: VALID_EXP, role: 'editor', ...REGISTERED });
        const ctx = await renderWithUser(fakeUser(token, false));
        expect(ctx().idToken).toBe(token);
        expect(ctx().isAdmin).toBe(false);
    });

    it('is false when the admin token has expired (same rule as the proxy)', async () => {
        const token = makeToken({ exp: EXPIRED_EXP, role: 'admin', ...REGISTERED });
        const ctx = await renderWithUser(fakeUser(token, false));
        expect(ctx().idToken).toBe(token);
        expect(ctx().isAdmin).toBe(false);
    });

    it('is false when the token is malformed', async () => {
        const ctx = await renderWithUser(fakeUser('not-a-jwt', false));
        expect(ctx().idToken).toBe('not-a-jwt');
        expect(ctx().isAdmin).toBe(false);
    });

    it('is false when user.isAnonymous is true even if the token claim is registered', async () => {
        const token = makeToken({ exp: VALID_EXP, role: 'admin', ...REGISTERED });
        const ctx = await renderWithUser(fakeUser(token, true));
        expect(ctx().idToken).toBe(token);
        expect(ctx().isAdmin).toBe(false);
    });

    it('is false when the token sign_in_provider is anonymous even if user.isAnonymous is false', async () => {
        const token = makeToken({ exp: VALID_EXP, role: 'admin', firebase: { sign_in_provider: 'anonymous' } });
        const ctx = await renderWithUser(fakeUser(token, false));
        expect(ctx().idToken).toBe(token);
        expect(ctx().isAdmin).toBe(false);
    });

    it('is false when nobody is signed in', async () => {
        const ctx = await renderWithUser(null);
        expect(ctx().isInitialized).toBe(true);
        expect(ctx().idToken).toBeNull();
        expect(ctx().isAdmin).toBe(false);
    });

    it('flips when tokenManager refreshes the token (grant and revocation)', async () => {
        let onRefreshCallback: ((newToken: string) => Promise<void>) | undefined;
        mockOnRefresh.mockImplementation((cb: (newToken: string) => Promise<void>) => {
            onRefreshCallback = cb;
            return jest.fn();
        });

        const normalToken = makeToken({ exp: VALID_EXP, ...REGISTERED });
        const adminToken = makeToken({ exp: VALID_EXP, role: 'admin', ...REGISTERED });
        const ctx = await renderWithUser(fakeUser(normalToken, false));
        expect(ctx().isAdmin).toBe(false);

        await act(async () => {
            await onRefreshCallback!(adminToken);
        });
        expect(ctx().isAdmin).toBe(true);

        await act(async () => {
            await onRefreshCallback!(normalToken);
        });
        expect(ctx().isAdmin).toBe(false);
    });

    it('flips to true when an anonymous session upgrades to an admin account via onIdTokenChanged', async () => {
        let onIdTokenCallback: ((u: User | null) => Promise<void>) | undefined;
        mockOnIdTokenChanged.mockImplementation((_auth: unknown, cb: (u: User | null) => Promise<void>) => {
            onIdTokenCallback = cb;
            return jest.fn();
        });

        const anonToken = makeToken({ exp: VALID_EXP, firebase: { sign_in_provider: 'anonymous' } });
        const ctx = await renderWithUser(fakeUser(anonToken, true));
        expect(ctx().isAdmin).toBe(false);

        const adminToken = makeToken({ exp: VALID_EXP, role: 'admin', ...REGISTERED });
        await act(async () => {
            await onIdTokenCallback!(fakeUser(adminToken, false));
        });
        expect(ctx().isAdmin).toBe(true);
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
