/**
 * Outcome of the last guest claim (lib/auth/guest-claim.ts), outside React so
 * the login code (AuthProvider, forms) can write it and the chat
 * (useChatSession) and GuestClaimNotice can read it.
 */

export type GuestClaimState =
    | { status: 'idle' }
    | { status: 'pending' }
    /** The guest's chats are the account's: the chat opens `openSessionId` (null: nothing to open). */
    | { status: 'done'; openSessionId: string | null }
    /** Shown until the user closes it; `retry` is null when trying again cannot help. */
    | { status: 'error'; message: string; retry: (() => Promise<void>) | null };

let state: GuestClaimState = { status: 'idle' };
const listeners = new Set<() => void>();

export const guestClaimStore = {
    get: (): GuestClaimState => state,

    set(next: GuestClaimState): void {
        state = next;
        listeners.forEach((listener) => listener());
    },

    /** The chat opened the claimed session, or the user closed the notice. */
    reset(): void {
        guestClaimStore.set({ status: 'idle' });
    },

    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};
