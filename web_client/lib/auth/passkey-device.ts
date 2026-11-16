/**
 * Per-device "biometric login enrolled" marker.
 *
 * The passkey login button is public (pre-authentication), so the server cannot
 * be asked whether *this device* has a passkey. Instead we remember — on this
 * device only — that a passkey was successfully registered/used from a profile.
 * The login button stays disabled until the marker exists.
 *
 * Persistence (two layers, either is enough):
 * 1. `localStorage` — immediate, written by the client.
 * 2. A first-party cookie set by the server proxy (`app/api/passkey/[...path]`)
 *    after a successful register/authenticate verify. Safari/iOS ITP evicts
 *    script-writable storage after 7 days without interaction, whereas
 *    HTTP-set cookies survive, so this keeps iPhone users enrolled.
 *
 * This is a UX gate only. The real security boundary stays on the backend
 * (register requires a valid JWT; authenticate requires a known credential).
 */

export const PASSKEY_DEVICE_STORAGE_KEY = 'syd.passkey.device.v1';
export const PASSKEY_DEVICE_COOKIE = 'syd_passkey_device';

const CHANGE_EVENT = 'syd:passkey-device-change';

function readCookieFlag(): boolean {
    if (typeof document === 'undefined') return false;
    return document.cookie
        .split(';')
        .some((part) => part.trim() === `${PASSKEY_DEVICE_COOKIE}=1`);
}

/** True when a passkey was registered/used on this device. SSR-safe. */
export function hasDevicePasskey(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        if (window.localStorage.getItem(PASSKEY_DEVICE_STORAGE_KEY) === '1') return true;
    } catch {
        // Storage can throw (Safari private mode, blocked storage): fall back to cookie.
    }
    return readCookieFlag();
}

function notify(): void {
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Record that this device has a registered passkey. */
export function markDevicePasskey(): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(PASSKEY_DEVICE_STORAGE_KEY, '1');
    } catch {
        // Ignore: the server-set cookie is the fallback.
    }
    notify();
}

/** Forget the marker (e.g. the backend no longer recognises the credential). */
export function clearDevicePasskey(): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(PASSKEY_DEVICE_STORAGE_KEY);
    } catch {
        // Ignore.
    }
    document.cookie = `${PASSKEY_DEVICE_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
    notify();
}

/** `useSyncExternalStore`-compatible subscription (same-tab + cross-tab). */
export function subscribeDevicePasskey(onChange: () => void): () => void {
    if (typeof window === 'undefined') return () => undefined;
    const onStorage = (e: StorageEvent) => {
        if (e.key === null || e.key === PASSKEY_DEVICE_STORAGE_KEY) onChange();
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(CHANGE_EVENT, onChange);
        window.removeEventListener('storage', onStorage);
    };
}

/** Error raised when login is attempted on a device without an enrolled passkey. */
export const PASSKEY_NOT_ENROLLED_MESSAGE = 'Biometria non attivata su questo dispositivo';
