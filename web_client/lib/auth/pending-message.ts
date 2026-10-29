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

const STORAGE_KEY = 'syd:pendingMessage';
const REDIRECT_MAX_AGE_MS = 10 * 60 * 1000;

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
        if (!message) return;
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ text: message, savedAt: Date.now() }));
        } catch {
            // Storage unavailable: the login still completes, the user writes again.
        }
    },

    /** Back from the provider: the message kept by keepForRedirect (read once). */
    restoreAfterRedirect(): void {
        let saved: unknown = null;
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY);
            sessionStorage.removeItem(STORAGE_KEY);
            saved = raw === null ? null : JSON.parse(raw);
        } catch {
            return;
        }
        const { text, savedAt } = (saved ?? {}) as { text?: unknown; savedAt?: unknown };
        if (typeof text !== 'string' || typeof savedAt !== 'number') return;
        if (Date.now() - savedAt > REDIRECT_MAX_AGE_MS) return;
        set(text);
    },
};
