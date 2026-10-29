/**
 * Where a magic link brings the user back (Phase 139 PR-0b): the page the link
 * was asked from, with the chat open if it was. Both travel in the link, so it
 * works in another tab or on another device too.
 */
import { safeNextPath } from './safe-next';

const NEXT_PARAM = 'next';
const CHAT_PARAM = 'chat';
const CHAT_OPEN = 'open';

/** The page `/auth/verify` returns to: `path` (pathname + search), chat as it is now. */
export function magicLinkContinueUrl(origin: string, path: string, chatOpen: boolean): string {
    const url = new URL('/auth/verify', origin);
    url.searchParams.set(NEXT_PARAM, path);
    if (chatOpen) url.searchParams.set(CHAT_PARAM, CHAT_OPEN);
    return url.toString();
}

/** What the link asks for, with the page restricted to this site. */
export function magicLinkReturn(search: string): { next: string; reopenChat: boolean } {
    const params = new URLSearchParams(search);
    return {
        next: safeNextPath(params.get(NEXT_PARAM)),
        reopenChat: params.get(CHAT_PARAM) === CHAT_OPEN,
    };
}
