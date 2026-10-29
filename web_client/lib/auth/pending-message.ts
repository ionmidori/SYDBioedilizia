/**
 * The message a guest sent when the login card stopped it (Phase 138 PR-6):
 * GlobalAuthListener sends it again once the login and the claim of the
 * guest's chats have settled, so the confirmed render or quote starts in the
 * same conversation without the user typing it again.
 *
 * Kept in memory. A social login by redirect reloads the page, so for that
 * round trip only it waits in this tab's sessionStorage, and is dropped if the
 * user does not come back soon (a stale confirmation must not start a quote).
 */

import { keepForReturn, takeOnReturn } from './redirect-login';

const STORAGE_KEY = 'syd:pendingMessage';

let message = '';
const listeners = new Set<() => void>();

function set(next: string): void {
    message = next;
    listeners.forEach((listener) => listener());
}

export const pendingMessageStore = {
    get: (): string => message,

    set,

    clear(): void {
        set('');
    },

    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },

    /** The page is leaving for the provider: keep the message for the way back. */
    keepForRedirect(): void {
        // No message: drop a copy left by a redirect that never left the page.
        if (!message) takeOnReturn(STORAGE_KEY);
        else keepForReturn(STORAGE_KEY, { text: message });
    },

    /** Back from the provider: the message kept by keepForRedirect (read once). */
    restoreAfterRedirect(): void {
        const text = takeOnReturn(STORAGE_KEY)?.text;
        if (typeof text === 'string') set(text);
    },
};
