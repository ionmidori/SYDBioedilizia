/**
 * A guest's chats follow it into its account (Phase 138 PR-6): the bug was that
 * a guest signing in to an EXISTING account lost the chats written as a guest.
 */
import {
    getRedirectResult,
    linkWithCredential,
    linkWithPopup,
    OAuthProvider,
    signInWithCredential,
    signInWithPopup,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { guestClaimApi } from '@/lib/guest-claim-api';
import { projectsApi } from '@/lib/projects-api';
import { guestClaimStore } from '@/lib/auth/guest-claim-store';
import {
    claimGuestChats,
    createAccountKeepingGuestChats,
    finishRedirectKeepingGuestChats,
    GUEST_CLAIM_UNAVAILABLE,
    popupKeepingGuestChats,
    signInKeepingGuestChats,
} from '../guest-claim';

jest.mock('firebase/auth', () => ({
    getRedirectResult: jest.fn(),
    linkWithCredential: jest.fn(),
    linkWithPopup: jest.fn(),
    linkWithRedirect: jest.fn(),
    OAuthProvider: { credentialFromError: jest.fn() },
    signInWithCredential: jest.fn(),
    signInWithPopup: jest.fn(),
    signInWithRedirect: jest.fn(),
}));
jest.mock('@/lib/firebase', () => ({ auth: { currentUser: null } }));
jest.mock('@/lib/guest-claim-api', () => ({ guestClaimApi: { issueTicket: jest.fn(), claim: jest.fn() } }));
jest.mock('@/lib/projects-api', () => ({ projectsApi: { listProjects: jest.fn() } }));
jest.mock('@/lib/query-client', () => ({ queryClient: { invalidateQueries: jest.fn() } }));

const GUEST = { uid: 'anon-1', isAnonymous: true };
const ACCOUNT = { uid: 'user-1', isAnonymous: false };
const TICKET = 't'.repeat(43);

const mockAuth = auth as { currentUser: unknown };
const mockIssue = guestClaimApi.issueTicket as jest.Mock;
const mockClaim = guestClaimApi.claim as jest.Mock;
const mockList = projectsApi.listProjects as jest.Mock;

/** Let the claim, which runs on its own after the login, finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A login that replaces the anonymous user with the account. */
const signInToAccount = jest.fn(async () => {
    mockAuth.currentUser = ACCOUNT;
    return 'signed-in';
});

beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    guestClaimStore.reset();
    mockAuth.currentUser = GUEST;
    mockIssue.mockResolvedValue({ ticket: TICKET, expires_at: '2026-10-29T10:15:00+00:00' });
    mockClaim.mockResolvedValue({ session_ids: ['guest-chat'], open_session_id: 'guest-chat' });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('signing in to an existing account as a guest', () => {
    it('asks for the ticket while still a guest, then moves the chats and opens the guest chat', async () => {
        localStorage.setItem('chatSessionId', 'guest-chat');
        let finishTransfer: (result: unknown) => void = () => {};
        mockClaim.mockReturnValue(new Promise((resolve) => { finishTransfer = resolve; }));

        await expect(signInKeepingGuestChats(signInToAccount)).resolves.toBe('signed-in');
        // The login does not wait for the transfer: the chat follows the store.
        expect(guestClaimStore.get()).toEqual({ status: 'pending' });
        finishTransfer({ session_ids: ['guest-chat'], open_session_id: 'guest-chat' });
        await settle();

        expect(mockIssue.mock.invocationCallOrder[0]).toBeLessThan(signInToAccount.mock.invocationCallOrder[0]);
        expect(mockClaim).toHaveBeenCalledWith(TICKET);
        expect(guestClaimStore.get()).toEqual({ status: 'done', openSessionId: 'guest-chat' });
        // Also after a reload: the chat reopens the last active project.
        expect(localStorage.getItem('last_active_project:user-1')).toBe('guest-chat');
        // The id now names the account's chat: a later guest starts a new one.
        expect(localStorage.getItem('chatSessionId')).toBeNull();
    });

    it('does not start the login when the ticket cannot be had', async () => {
        mockIssue.mockRejectedValue(new TypeError('Failed to fetch'));

        await expect(signInKeepingGuestChats(signInToAccount)).rejects.toMatchObject({ code: GUEST_CLAIM_UNAVAILABLE });
        expect(signInToAccount).not.toHaveBeenCalled();
    });

    it('is a plain login without a guest', async () => {
        mockAuth.currentUser = null;

        await signInKeepingGuestChats(signInToAccount);

        expect(mockIssue).not.toHaveBeenCalled();
        expect(mockClaim).not.toHaveBeenCalled();
    });
});

describe('a failed claim', () => {
    it('stays on screen with "Riprova", and the retry finishes the claim', async () => {
        mockClaim.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await claimGuestChats(TICKET);

        const failed = guestClaimStore.get();
        expect(failed).toMatchObject({ status: 'error', message: expect.stringContaining('ospite') });
        expect(failed.status === 'error' && failed.retry).toBeTruthy();

        if (failed.status === 'error' && failed.retry) await failed.retry();
        expect(guestClaimStore.get()).toEqual({ status: 'done', openSessionId: 'guest-chat' });
    });

    it('shows the reason of a denial and offers no retry', async () => {
        mockClaim.mockRejectedValue({ error_code: 'GUEST_CLAIM_DENIED', message: 'Il collegamento è scaduto.' });

        await claimGuestChats(TICKET);

        expect(guestClaimStore.get()).toEqual({ status: 'error', message: 'Il collegamento è scaduto.', retry: null });
    });
});

describe('Google popup', () => {
    const provider = { providerId: 'google.com' } as never;

    it('links a new account to the guest: same uid, the chat opens the latest guest chat', async () => {
        (linkWithPopup as jest.Mock).mockResolvedValue({ operationType: 'link' });
        mockList.mockResolvedValue([{ session_id: 'latest' }, { session_id: 'older' }]);

        await popupKeepingGuestChats(provider);

        expect(linkWithPopup).toHaveBeenCalledWith(GUEST, provider);
        expect(mockIssue).not.toHaveBeenCalled();
        expect(guestClaimStore.get()).toEqual({ status: 'done', openSessionId: 'latest' });
    });

    it('signs in to an existing account with the error credential and moves the chats', async () => {
        const error = { code: 'auth/credential-already-in-use' };
        const credential = { providerId: 'google.com' };
        (linkWithPopup as jest.Mock).mockRejectedValue(error);
        (OAuthProvider.credentialFromError as jest.Mock).mockReturnValue(credential);
        (signInWithCredential as jest.Mock).mockImplementation(async () => {
            mockAuth.currentUser = ACCOUNT;
        });

        await popupKeepingGuestChats(provider);

        expect(signInWithCredential).toHaveBeenCalledWith(auth, credential);
        expect(mockIssue.mock.invocationCallOrder[0]).toBeLessThan(
            (signInWithCredential as jest.Mock).mock.invocationCallOrder[0]
        );
        expect(mockClaim).toHaveBeenCalledWith(TICKET);
    });

    it('rethrows any other link error', async () => {
        (linkWithPopup as jest.Mock).mockRejectedValue({ code: 'auth/popup-blocked' });

        await expect(popupKeepingGuestChats(provider)).rejects.toEqual({ code: 'auth/popup-blocked' });
        expect(mockClaim).not.toHaveBeenCalled();
    });

    it('is a plain popup login without a guest', async () => {
        mockAuth.currentUser = null;
        await popupKeepingGuestChats(provider);
        expect(signInWithPopup).toHaveBeenCalled();
        expect(linkWithPopup).not.toHaveBeenCalled();
    });
});

describe('back from a Google redirect', () => {
    it('signs in to the existing account the link found, moving the chats', async () => {
        (getRedirectResult as jest.Mock).mockRejectedValue({ code: 'auth/credential-already-in-use' });
        (OAuthProvider.credentialFromError as jest.Mock).mockReturnValue({ providerId: 'google.com' });
        (signInWithCredential as jest.Mock).mockImplementation(async () => {
            mockAuth.currentUser = ACCOUNT;
        });

        await expect(finishRedirectKeepingGuestChats()).resolves.toBe(true);
        expect(mockClaim).toHaveBeenCalledWith(TICKET);
    });

    it('opens the guest chat after a link', async () => {
        (getRedirectResult as jest.Mock).mockResolvedValue({ user: GUEST, operationType: 'link' });
        mockList.mockResolvedValue([{ session_id: 'latest' }]);

        await expect(finishRedirectKeepingGuestChats()).resolves.toBe(true);
        expect(guestClaimStore.get()).toEqual({ status: 'done', openSessionId: 'latest' });
    });

    it('reports no login when none was in flight', async () => {
        (getRedirectResult as jest.Mock).mockResolvedValue(null);
        await expect(finishRedirectKeepingGuestChats()).resolves.toBe(false);
    });
});

describe('creating an email account as a guest', () => {
    it('links the credential to the guest instead of creating a new user', async () => {
        const create = jest.fn();
        mockList.mockResolvedValue([]);

        await createAccountKeepingGuestChats({ providerId: 'password' } as never, create);

        expect(linkWithCredential).toHaveBeenCalledWith(GUEST, { providerId: 'password' });
        expect(create).not.toHaveBeenCalled();
        expect(guestClaimStore.get()).toEqual({ status: 'done', openSessionId: null });
    });
});
