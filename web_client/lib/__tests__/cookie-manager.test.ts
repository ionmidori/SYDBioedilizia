import { CookieManager, type CookieCategory } from '../cookie-manager';

/**
 * jsdom's document.cookie is a real cookie jar: writes merge, `expires` in the
 * past deletes. Each test starts from a clean jar.
 */
function clearCookies(): void {
    for (const pair of document.cookie.split(';')) {
        const name = pair.split('=')[0]?.trim();
        if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
}

beforeEach(clearCookies);

describe('set / get', () => {
    it('round-trips a value', () => {
        CookieManager.set('syd_test', 'hello');
        expect(CookieManager.get('syd_test')).toBe('hello');
    });

    it('round-trips values needing url-encoding', () => {
        CookieManager.set('syd test', 'a=b; c,d');
        expect(CookieManager.get('syd test')).toBe('a=b; c,d');
    });

    it('returns null for a cookie that was never set', () => {
        expect(CookieManager.get('syd_absent')).toBeNull();
    });

    it('does not match a cookie whose name is a suffix of another', () => {
        CookieManager.set('syd_consent_extra', 'x');
        expect(CookieManager.get('extra')).toBeNull();
    });

    it('writes the security defaults (path, samesite)', () => {
        const spy = jest.spyOn(document, 'cookie', 'set');
        CookieManager.set('syd_flags', '1');
        const written = spy.mock.calls[0][0];
        expect(written).toContain('path=/');
        expect(written).toContain('samesite=Lax');
        expect(written).toContain('expires=');
        spy.mockRestore();
    });

    it('honours explicit options over the defaults', () => {
        const spy = jest.spyOn(document, 'cookie', 'set');
        CookieManager.set('syd_flags', '1', { path: '/dashboard', sameSite: 'Strict', secure: true, domain: 'example.com' });
        const written = spy.mock.calls[0][0];
        expect(written).toContain('path=/dashboard');
        expect(written).toContain('samesite=Strict');
        expect(written).toContain('domain=example.com');
        expect(written).toContain('; secure');
        spy.mockRestore();
    });

    it('omits expires when days is 0 (session cookie)', () => {
        const spy = jest.spyOn(document, 'cookie', 'set');
        CookieManager.set('syd_session_only', '1', { days: 0 });
        expect(spy.mock.calls[0][0]).not.toContain('expires=');
        spy.mockRestore();
    });
});

describe('remove', () => {
    it('deletes an existing cookie', () => {
        CookieManager.set('syd_temp', 'x');
        expect(CookieManager.get('syd_temp')).toBe('x');
        CookieManager.remove('syd_temp');
        expect(CookieManager.get('syd_temp')).toBeNull();
    });
});

describe('consent', () => {
    const all: Record<CookieCategory, boolean> = { essential: true, analytics: true, marketing: true };

    it('returns null before any consent is stored', () => {
        expect(CookieManager.getConsent()).toBeNull();
    });

    it('round-trips the consent record', () => {
        CookieManager.setConsent(all);
        expect(CookieManager.getConsent()).toEqual(all);
    });

    it('returns null on a corrupted consent cookie instead of throwing', () => {
        CookieManager.set('syd_cookie_consent', '{not-json');
        expect(CookieManager.getConsent()).toBeNull();
    });

    it('dispatches cookie_consent_updated so components can react', () => {
        const listener = jest.fn();
        window.addEventListener('cookie_consent_updated', listener);
        CookieManager.setConsent(all);
        expect(listener).toHaveBeenCalledTimes(1);
        expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual(all);
        window.removeEventListener('cookie_consent_updated', listener);
    });
});

describe('isAllowed', () => {
    it('allows only essential cookies when no consent was given', () => {
        expect(CookieManager.isAllowed('essential')).toBe(true);
        expect(CookieManager.isAllowed('analytics')).toBe(false);
        expect(CookieManager.isAllowed('marketing')).toBe(false);
    });

    it('follows the stored consent per category', () => {
        CookieManager.setConsent({ essential: true, analytics: true, marketing: false });
        expect(CookieManager.isAllowed('analytics')).toBe(true);
        expect(CookieManager.isAllowed('marketing')).toBe(false);
    });

    it('keeps essential allowed even if the stored consent denies it', () => {
        CookieManager.setConsent({ essential: false, analytics: false, marketing: false });
        expect(CookieManager.isAllowed('essential')).toBe(true);
    });
});
