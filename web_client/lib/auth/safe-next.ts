/**
 * The page to return to after a magic link (`/auth/verify?next=…`). The link
 * can be written by anyone, so only a path of this site is followed; anything
 * else (another host, `//host`, `\host`, a script URL) goes home: no open
 * redirect.
 */

const HOME = '/';
const VERIFY_PATH = '/auth/verify';
// Any origin works: a path that stays on it is a path of this site.
const BASE = 'https://syd.invalid';
// Browsers read `\` as `/` and drop tabs and newlines, so `/\host` would leave the site.
const UNSAFE_CHARS = /[\\\u0000-\u001f\u007f]/;

export function safeNextPath(raw: string | null | undefined): string {
    if (!raw || !raw.startsWith('/') || raw.startsWith('//') || UNSAFE_CHARS.test(raw)) return HOME;
    let url: URL;
    try {
        url = new URL(raw, BASE);
    } catch {
        return HOME;
    }
    if (url.origin !== BASE) return HOME;
    // Checked again after normalization: `/.//host` and `/a/..//host` become `//host`.
    if (url.pathname.startsWith('//')) return HOME;
    if (url.pathname === VERIFY_PATH || url.pathname.startsWith(`${VERIFY_PATH}/`)) return HOME;
    return url.pathname + url.search + url.hash;
}
