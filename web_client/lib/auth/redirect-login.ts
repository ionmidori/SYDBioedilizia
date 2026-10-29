/**
 * Social login on phones: popup vs redirect.
 *
 * Google sign-in used only signInWithPopup. Popups fail on in-app browsers
 * (Instagram, Gmail…) and in the installed PWA, and on iOS the failure often
 * surfaces as `auth/popup-closed-by-user`, which the dialog ignored: the user
 * saw nothing. signInWithRedirect is Firebase's answer for those environments,
 * but Safari partitions third-party storage, so it only works when the auth
 * domain is the site itself (`/__/auth/*` proxied to firebaseapp.com, see
 * next.config.ts). Until NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is switched to the
 * site host, redirect stays off and the popup flow is unchanged.
 */

const PENDING_KEY = 'syd:authRedirect';

/**
 * How long what a page keeps for the way back from the provider stays valid:
 * a user who comes back later is not resuming that login.
 */
const RETURN_MAX_AGE_MS = 10 * 60 * 1000;

const MOBILE_OR_IN_APP = /iPhone|iPad|iPod|Android|FBAN|FBAV|Instagram|Line\/|GSA\//i;

const POPUP_UNSUPPORTED_CODES = new Set([
    'auth/popup-blocked',
    'auth/operation-not-supported-in-this-environment',
]);

export function redirectAvailable(authDomain: string | undefined, host: string): boolean {
    return !!authDomain && authDomain === host;
}

export function prefersRedirect(userAgent: string, standalone: boolean): boolean {
    return standalone || MOBILE_OR_IN_APP.test(userAgent);
}

export function isPopupUnsupported(error: unknown): boolean {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === 'string' && POPUP_UNSUPPORTED_CODES.has(code);
}

/** Browser check: redirect is configured for this site. */
export function canRedirectHere(): boolean {
    if (typeof window === 'undefined') return false;
    return redirectAvailable(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, window.location.host);
}

/** Browser check: start with a redirect instead of a popup. */
export function shouldRedirectFirst(): boolean {
    if (!canRedirectHere()) return false;
    const standalone =
        window.matchMedia?.('(display-mode: standalone)').matches === true ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return prefersRedirect(navigator.userAgent, standalone);
}

/**
 * Remember that this tab left for the provider, so the login is finished on
 * return. No claim data is kept: the anonymous guest is still signed in on the
 * way back (lib/auth/guest-claim.ts). The page keeps only what the user sees:
 * the pending message (lib/auth/pending-message.ts) and the open chat
 * (lib/chat/chat-window-state.ts).
 */
export function savePendingRedirect(): void {
    try {
        sessionStorage.setItem(PENDING_KEY, '1');
    } catch {
        // Storage unavailable: Firebase still completes a plain login or a guest's
        // link on return, but a guest whose account exists stays a guest.
    }
}

/** Whether a redirect login was started from this tab (read once). */
export function takePendingRedirect(): boolean {
    try {
        if (sessionStorage.getItem(PENDING_KEY) === null) return false;
        sessionStorage.removeItem(PENDING_KEY);
        return true;
    } catch {
        return false;
    }
}

/**
 * Keep `data` in this tab under `key` for the page the login comes back to
 * (redirect, magic link). Storage unavailable: nothing is kept, the login
 * still completes.
 */
export function keepForReturn(key: string, data: Record<string, unknown> = {}): void {
    try {
        sessionStorage.setItem(key, JSON.stringify({ ...data, savedAt: Date.now() }));
    } catch {
        // Nothing kept: the user finds the page as a fresh load.
    }
}

/** What keepForReturn kept under `key`, read once; null when missing, unreadable or too old. */
export function takeOnReturn(key: string): Record<string, unknown> | null {
    let saved: unknown;
    try {
        const raw = sessionStorage.getItem(key);
        if (raw === null) return null;
        sessionStorage.removeItem(key);
        saved = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof saved !== 'object' || saved === null) return null;
    const { savedAt } = saved as { savedAt?: unknown };
    if (typeof savedAt !== 'number' || Date.now() - savedAt > RETURN_MAX_AGE_MS) return null;
    return saved as Record<string, unknown>;
}
