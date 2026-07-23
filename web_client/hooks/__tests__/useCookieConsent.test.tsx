import { CookieManager } from '@/lib/cookie-manager';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCookieConsent } from '../useCookieConsent';

// Real CookieManager on the jsdom cookie jar: reset the consent cookie per test.
beforeEach(() => {
    CookieManager.remove('syd_cookie_consent');
});

describe('useCookieConsent', () => {
    it('initialises with no consent when the cookie is absent', async () => {
        const { result } = renderHook(() => useCookieConsent());

        expect(result.current.isInitialized).toBe(false);
        await waitFor(() => expect(result.current.isInitialized).toBe(true));
        expect(result.current.consent).toBeNull();
    });

    it('loads a previously stored consent', async () => {
        CookieManager.setConsent({ essential: true, analytics: true, marketing: false });

        const { result } = renderHook(() => useCookieConsent());

        await waitFor(() => expect(result.current.isInitialized).toBe(true));
        expect(result.current.consent).toEqual({
            essential: true,
            analytics: true,
            marketing: false,
        });
    });

    it('acceptAll persists every category', async () => {
        const { result } = renderHook(() => useCookieConsent());
        await waitFor(() => expect(result.current.isInitialized).toBe(true));

        act(() => result.current.acceptAll());

        expect(result.current.consent).toEqual({
            essential: true,
            analytics: true,
            marketing: true,
        });
        expect(CookieManager.getConsent()).toEqual(result.current.consent);
    });

    it('declineAll keeps only the essential category', async () => {
        const { result } = renderHook(() => useCookieConsent());
        await waitFor(() => expect(result.current.isInitialized).toBe(true));

        act(() => result.current.declineAll());

        expect(result.current.consent).toEqual({
            essential: true,
            analytics: false,
            marketing: false,
        });
    });

    it('reacts to consent updates from elsewhere in the app', async () => {
        const { result } = renderHook(() => useCookieConsent());
        await waitFor(() => expect(result.current.isInitialized).toBe(true));

        act(() => {
            CookieManager.setConsent({ essential: true, analytics: true, marketing: true });
        });

        expect(result.current.consent).toEqual({
            essential: true,
            analytics: true,
            marketing: true,
        });
    });

    it('isAllowed defaults to essential-only before any consent', async () => {
        const { result } = renderHook(() => useCookieConsent());
        await waitFor(() => expect(result.current.isInitialized).toBe(true));

        expect(result.current.isAllowed('essential')).toBe(true);
        expect(result.current.isAllowed('analytics')).toBe(false);
    });
});
