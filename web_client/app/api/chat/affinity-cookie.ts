/**
 * Cloud Run session affinity across the chat proxy.
 *
 * The backend keeps each conversation's ADK session in the memory of one Cloud
 * Run instance, and `--session-affinity` routes a client back to it with the
 * `GAESA` cookie. The browser never talks to Cloud Run directly: this proxy
 * re-issues that cookie on its own origin (`syd_affinity`, scoped to /api/chat)
 * and sends it back upstream as `GAESA` on the next turn.
 *
 * Affinity is best effort; the backend still resyncs a session that another
 * instance has moved past (src/adk/adk_orchestrator.py).
 */

export const BROWSER_AFFINITY_COOKIE = 'syd_affinity';
const CLOUD_RUN_AFFINITY_COOKIE = 'GAESA';

// Cookie-value characters only: never lets a header delimiter through.
const SAFE_VALUE = /^[A-Za-z0-9._~+/=-]{1,4096}$/;

function cookieValue(pairs: string, name: string): string | null {
    for (const pair of pairs.split(';')) {
        const eq = pair.indexOf('=');
        if (eq > 0 && pair.slice(0, eq).trim() === name) {
            const value = pair.slice(eq + 1).trim();
            return SAFE_VALUE.test(value) ? value : null;
        }
    }
    return null;
}

/** `Cookie` header for the backend request, from the browser's cookies. */
export function affinityCookieForBackend(browserCookies: string | null): string | null {
    const value = browserCookies ? cookieValue(browserCookies, BROWSER_AFFINITY_COOKIE) : null;
    return value ? `${CLOUD_RUN_AFFINITY_COOKIE}=${value}` : null;
}

/** `Set-Cookie` header for the browser, from the backend's `Set-Cookie` headers. */
export function affinityCookieForBrowser(backendSetCookies: string[]): string | null {
    for (const header of backendSetCookies) {
        const [pair, ...attributes] = header.split(';');
        const value = cookieValue(pair, CLOUD_RUN_AFFINITY_COOKIE);
        if (!value) continue;
        // Keep the lifetime Cloud Run chose; drop its Domain/Path (they name run.app).
        const lifetime = attributes
            .map((a) => a.trim())
            .filter((a) => /^(max-age|expires)=/i.test(a) && !/[\r\n]/.test(a));
        return [
            `${BROWSER_AFFINITY_COOKIE}=${value}`,
            'Path=/api/chat',
            'HttpOnly',
            'Secure',
            'SameSite=Lax',
            ...lifetime,
        ].join('; ');
    }
    return null;
}
