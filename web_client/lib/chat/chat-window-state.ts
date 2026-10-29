/**
 * Whether the floating chat window is open, beyond a login that leaves the
 * page (Phase 139 PR-0b). A social login by redirect reloads the page and a
 * magic link opens a new one: without this the user came back with the chat
 * closed. The login code reads the open state here (ChatWidget reports it) and
 * asks the next page of this tab to open the chat again, once; it is dropped
 * if the user does not come back soon, like the pending message
 * (lib/auth/pending-message.ts).
 */
import { keepForReturn, takeOnReturn } from '@/lib/auth/redirect-login';

const STORAGE_KEY = 'syd:reopenChat';

let open = false;

export function setChatWindowOpen(next: boolean): void {
    open = next;
}

export function isChatWindowOpen(): boolean {
    return open;
}

/** The page is leaving with the chat open: the next page of this tab opens it again. */
export function reopenChatOnNextPage(): void {
    keepForReturn(STORAGE_KEY);
}

/** Whether this page should open the chat again (read once). */
export function takeReopenChat(): boolean {
    return takeOnReturn(STORAGE_KEY) !== null;
}
