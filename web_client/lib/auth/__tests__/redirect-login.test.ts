import {
    isPopupUnsupported,
    prefersRedirect,
    redirectAvailable,
    savePendingRedirect,
    takePendingRedirect,
} from '../redirect-login';

const IPHONE_SAFARI =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Mobile/15E148 Safari/604.1';
const INSTAGRAM_IN_APP =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0';
const ANDROID_CHROME =
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0 Mobile Safari/537.36';
const DESKTOP_CHROME =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

describe('redirectAvailable', () => {
    // Safari partitions third-party storage: signInWithRedirect only works when
    // the auth domain IS the site (with /__/auth proxied to firebaseapp.com).
    it('is true only when authDomain is the site host', () => {
        expect(redirectAvailable('sydbioedilizia.vercel.app', 'sydbioedilizia.vercel.app')).toBe(true);
        expect(redirectAvailable('chatbotluca-a8a73.firebaseapp.com', 'sydbioedilizia.vercel.app')).toBe(false);
        expect(redirectAvailable(undefined, 'sydbioedilizia.vercel.app')).toBe(false);
    });
});

describe('prefersRedirect', () => {
    it.each([
        ['iPhone Safari', IPHONE_SAFARI, false],
        ['Instagram in-app browser', INSTAGRAM_IN_APP, false],
        ['Android Chrome', ANDROID_CHROME, false],
        ['installed PWA (standalone) on desktop', DESKTOP_CHROME, true],
    ])('%s → redirect', (_name, ua, standalone) => {
        expect(prefersRedirect(ua, standalone)).toBe(true);
    });

    it('desktop browser keeps the popup', () => {
        expect(prefersRedirect(DESKTOP_CHROME, false)).toBe(false);
    });
});

describe('isPopupUnsupported', () => {
    it.each(['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'])('%s', (code) => {
        expect(isPopupUnsupported({ code })).toBe(true);
    });

    it('a user closing the popup is not a reason to redirect', () => {
        expect(isPopupUnsupported({ code: 'auth/popup-closed-by-user' })).toBe(false);
        expect(isPopupUnsupported(new Error('x'))).toBe(false);
    });
});

describe('pending redirect', () => {
    beforeEach(() => sessionStorage.clear());

    it('survives the round trip once', () => {
        savePendingRedirect({ guestSessionId: 'guest-1', redirectTo: '/dashboard' });
        expect(takePendingRedirect()).toEqual({ guestSessionId: 'guest-1', redirectTo: '/dashboard' });
        expect(takePendingRedirect()).toBeNull();
    });

    it('ignores garbage', () => {
        sessionStorage.setItem('syd:authRedirect', '{not json');
        expect(takePendingRedirect()).toBeNull();
    });

    it('drops a redirect target that is not a local path', () => {
        savePendingRedirect({ guestSessionId: null, redirectTo: 'https://evil.example' });
        expect(takePendingRedirect()).toEqual({ guestSessionId: null, redirectTo: null });
    });
});
