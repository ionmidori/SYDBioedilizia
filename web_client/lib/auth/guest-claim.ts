/**
 * A guest's chats follow it into its account (Phase 138 PR-6).
 *
 * Guests chat as Firebase anonymous users, and their chats belong to the
 * anonymous uid. Every login path goes through here:
 * - a NEW account is linked to the anonymous user (linkWith*): same uid, the
 *   chats are already its own and the backend makes the latest one the
 *   account's chat (GET /api/me/chat);
 * - an EXISTING account replaces the anonymous user. While still anonymous the
 *   guest gets a claim ticket from the backend (proof it is that guest: knowing
 *   a session id is never enough); once signed in, the account redeems it and
 *   every guest chat comes into the account's one chat (Phase 139).
 * The ticket stays in memory: popup, email and passkey keep the page, and the
 * redirect flow learns that the account exists on its return, with the
 * anonymous user still signed in (linkWithRedirect fails, it does not replace).
 */
import {
    getRedirectResult,
    linkWithCredential,
    linkWithPopup,
    linkWithRedirect,
    OAuthProvider,
    signInWithCredential,
    signInWithPopup,
    signInWithRedirect,
    type AuthCredential,
    type AuthProvider,
    type User,
    type UserCredential,
} from 'firebase/auth';
import type { FirebaseError } from 'firebase/app';
import { auth } from '@/lib/firebase';
import { describeApiError } from '@/lib/api-client';
import { GUEST_SESSION_KEY } from '@/lib/chat-session-keys';
import { guestClaimApi } from '@/lib/guest-claim-api';
import { queryClient } from '@/lib/query-client';
import { HOUSE_QUOTE_QUERY_KEY } from '@/hooks/use-house-quote';
import { QUOTES_QUERY_KEY } from '@/hooks/use-quotes';
import { fetchUserChat, USER_CHAT_QUERY_KEY, userChatQuery } from '@/hooks/use-user-chat';
import { guestClaimStore } from '@/lib/auth/guest-claim-store';

/** Firebase's answer when the provider account already exists: sign in to it instead of linking. */
const ACCOUNT_EXISTS_CODES = new Set(['auth/credential-already-in-use', 'auth/email-already-in-use']);

/** Thrown (as a Firebase-style `code`) when the ticket cannot be had: the login does not start. */
export const GUEST_CLAIM_UNAVAILABLE = 'syd/guest-claim-unavailable';

const CLAIM_DENIED = 'GUEST_CLAIM_DENIED';

function anonymousUser(): User | null {
    const current = auth.currentUser;
    return current?.isAnonymous ? current : null;
}

export function accountAlreadyExists(error: unknown): boolean {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === 'string' && ACCOUNT_EXISTS_CODES.has(code);
}

/**
 * Run a login that moves the guest's chats: the store is 'pending' from its
 * start, so neither the chat nor the message waiting for the login
 * (GlobalAuthListener) runs on the account's own session before the chats
 * have moved — Firebase publishes the account before the claim can start.
 * Back to 'idle' when the login does not happen (wrong password, cancelled).
 */
async function whileSigningIn<T>(login: () => Promise<T>): Promise<T> {
    guestClaimStore.set({ status: 'pending' });
    try {
        return await login();
    } catch (error) {
        guestClaimStore.reset();
        throw error;
    }
}

/**
 * The login settled on the account's chat `sessionId`: the message waiting for
 * the login (GlobalAuthListener) goes there once the chat has opened it.
 */
async function openAfterLogin(sessionId: string | null): Promise<void> {
    try {
        // The guest chat id now names the account's chat (or one merged into it):
        // a later guest in this browser (e.g. after a sign-out that skips logout())
        // starts a new one.
        window.localStorage.removeItem(GUEST_SESSION_KEY);
    } catch {
        // localStorage unavailable: nothing kept to forget
    }
    // A guest's quote is now the quote of the house (or one of its quotes).
    await Promise.all([
        queryClient.invalidateQueries({ queryKey: HOUSE_QUOTE_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: QUOTES_QUERY_KEY }),
    ]);
    guestClaimStore.set({ status: 'done', openSessionId: sessionId });
}

/**
 * Move the chats of the guest that got `ticket` to the signed-in account.
 * Never throws: the outcome goes to guestClaimStore (GuestClaimNotice shows
 * a failure until the user closes it, with "Riprova" when it can help).
 */
export async function claimGuestChats(ticket: string): Promise<void> {
    guestClaimStore.set({ status: 'pending' });
    try {
        const result = await guestClaimApi.claim(ticket);
        // The guest's chats came into the account's chat, which the claim names.
        const uid = auth.currentUser?.uid;
        if (result.open_session_id && uid) {
            queryClient.setQueryData(userChatQuery(uid).queryKey, { chat_id: result.open_session_id, created: false });
        } else {
            await queryClient.invalidateQueries({ queryKey: USER_CHAT_QUERY_KEY });
        }
        await openAfterLogin(result.open_session_id);
    } catch (error) {
        console.warn('[GuestClaim] Claim failed:', error);
        // A denial (ticket expired or used, wrong account) stays a denial; anything else may pass on retry.
        const denied = (error as { error_code?: unknown } | null)?.error_code === CLAIM_DENIED;
        guestClaimStore.set({
            status: 'error',
            message: denied
                ? describeApiError(error)
                : 'Non siamo riusciti a trasferire le conversazioni da ospite sul tuo account.',
            retry: denied ? null : () => claimGuestChats(ticket),
        });
    }
}

/**
 * The anonymous user became the account (same uid): open the conversation it
 * was having. Never throws, like claimGuestChats: the login itself succeeded.
 */
export async function openChatAfterLink(): Promise<void> {
    guestClaimStore.set({ status: 'pending' });
    try {
        const uid = auth.currentUser?.uid;
        if (!uid) throw new Error('No signed-in user after the link');
        // A just-created account owns only its guest chats: the backend makes the
        // latest one the account's chat.
        const chat = await fetchUserChat(queryClient, uid);
        await openAfterLogin(chat.chat_id);
    } catch (error) {
        console.warn('[GuestClaim] Opening the guest chat failed:', error);
        guestClaimStore.set({
            status: 'error',
            message: 'Le conversazioni da ospite sono nel tuo account, ma non siamo riusciti ad aprirle.',
            retry: openChatAfterLink,
        });
    }
}

/**
 * Sign in to an existing account without losing the guest's chats. The ticket
 * is asked for first: if that fails the login does not start (the guest is
 * still signed in and can try again), so no chat is left behind. The claim
 * then runs on its own: the login does not wait for the transfer, the chat
 * and GuestClaimNotice follow it through guestClaimStore.
 */
export async function signInKeepingGuestChats<T>(signIn: () => Promise<T>): Promise<T> {
    // A magic link opens a new page, which signs in at once: until Firebase has
    // restored the session there is no guest yet, and its chats would stay behind.
    await auth.authStateReady();
    const guest = anonymousUser();
    if (!guest) return signIn();

    let ticket: string;
    try {
        ticket = (await guestClaimApi.issueTicket()).ticket;
    } catch (error) {
        console.warn('[GuestClaim] Ticket request failed:', error);
        throw Object.assign(new Error('Guest claim ticket unavailable'), { code: GUEST_CLAIM_UNAVAILABLE });
    }
    const result = await whileSigningIn(signIn);
    if (auth.currentUser?.uid !== guest.uid) void claimGuestChats(ticket);
    else guestClaimStore.reset();
    return result;
}

/**
 * Create an account from a guest: link `credential` to the anonymous user, so
 * the chats stay its own; without a guest, `create` makes a plain account.
 */
export async function createAccountKeepingGuestChats(
    credential: AuthCredential,
    create: () => Promise<unknown>
): Promise<void> {
    const guest = anonymousUser();
    if (!guest) {
        await create();
        return;
    }
    await whileSigningIn(() => linkWithCredential(guest, credential));
    await openChatAfterLink();
}

/**
 * Linking an OAuth provider to the guest failed because that account exists:
 * sign in to it with the credential the error carries, moving the guest's chats.
 * Rethrows `error` when it is anything else.
 */
async function signInToExistingAccount(error: unknown): Promise<void> {
    const credential = accountAlreadyExists(error) ? OAuthProvider.credentialFromError(error as FirebaseError) : null;
    if (!credential) throw error;
    await signInKeepingGuestChats(() => signInWithCredential(auth, credential));
}

/** Social login in a popup: a guest links the provider, or signs in to its existing account. */
export async function popupKeepingGuestChats(provider: AuthProvider): Promise<void> {
    const guest = anonymousUser();
    if (!guest) {
        await signInWithPopup(auth, provider);
        return;
    }
    try {
        await whileSigningIn(() => linkWithPopup(guest, provider));
    } catch (error) {
        await signInToExistingAccount(error);
        return;
    }
    await openChatAfterLink();
}

/** Social login by redirect: the page leaves; finishRedirectKeepingGuestChats completes it. */
export async function redirectKeepingGuestChats(provider: AuthProvider): Promise<void> {
    const guest = anonymousUser();
    await (guest ? linkWithRedirect(guest, provider) : signInWithRedirect(auth, provider));
}

/**
 * Back from the provider: finish the login started by redirectKeepingGuestChats.
 * Returns whether a login came back (false: none was in flight).
 */
export async function finishRedirectKeepingGuestChats(): Promise<boolean> {
    let result: UserCredential | null;
    try {
        result = await getRedirectResult(auth);
    } catch (error) {
        await signInToExistingAccount(error);
        return true;
    }
    if (!result?.user) return false;
    if (result.operationType === 'link') await openChatAfterLink();
    return true;
}
