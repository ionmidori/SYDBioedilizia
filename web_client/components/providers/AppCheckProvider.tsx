'use client';

import { useEffect } from 'react';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { app } from '@/lib/firebase';

/**
 * Global App Check Provider
 * Initializes Firebase App Check (ReCaptcha V3) to protect against bots.
 */
export function AppCheckProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Feature Flag Check
        if (process.env.NEXT_PUBLIC_ENABLE_APP_CHECK !== 'true') return;

        const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
        if (!siteKey) {
            console.warn('[AppCheck] Site Key missing provided, AppCheck disabled.');
            return;
        }

        try {
            // Initialize App Check
            // @ts-ignore - Firebase types can be finicky with global augmentation
            if (!window._firebaseAppCheckInitialized) {
                initializeAppCheck(app, {
                    provider: new ReCaptchaV3Provider(siteKey),
                    isTokenAutoRefreshEnabled: true
                });
                // @ts-ignore
                window._firebaseAppCheckInitialized = true;
                console.log('[AppCheck] Initialized successfully.');
            }
        } catch (error) {
            console.error('[AppCheck] Initialization failed:', error);
        }
    }, []);

    return <>{children}</>;
}
