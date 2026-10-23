import { affinityCookieForBackend, affinityCookieForBrowser } from '../affinity-cookie';

describe('affinityCookieForBackend', () => {
    test('sends the browser affinity cookie upstream as GAESA', () => {
        expect(affinityCookieForBackend('theme=dark; syd_affinity=Cp9abc_-.=; other=1')).toBe('GAESA=Cp9abc_-.=');
    });

    test('nothing without the cookie', () => {
        expect(affinityCookieForBackend(null)).toBeNull();
        expect(affinityCookieForBackend('theme=dark')).toBeNull();
    });

    test('rejects values that could break the header', () => {
        expect(affinityCookieForBackend('syd_affinity=abc def')).toBeNull();
        expect(affinityCookieForBackend('syd_affinity=abc,GAESA=x')).toBeNull();
    });
});

describe('affinityCookieForBrowser', () => {
    test('re-issues GAESA on the proxy origin, keeping its lifetime only', () => {
        const cookie = affinityCookieForBrowser([
            'other=1; Path=/',
            'GAESA=Cp9abc; expires=Sat, 22 Nov 2026 10:00:00 GMT; path=/; domain=syd-brain.a.run.app',
        ]);
        expect(cookie).toBe(
            'syd_affinity=Cp9abc; Path=/api/chat; HttpOnly; Secure; SameSite=Lax; expires=Sat, 22 Nov 2026 10:00:00 GMT',
        );
    });

    test('nothing when the backend sets no affinity cookie', () => {
        expect(affinityCookieForBrowser([])).toBeNull();
        expect(affinityCookieForBrowser(['other=1'])).toBeNull();
    });
});
