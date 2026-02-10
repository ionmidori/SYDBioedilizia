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

        if (process.env.NEXT_PUBLIC_ENABLE_APP_CHECK === 'true') {
            console.log("[AppCheck] 🛡️ Active (Managed via lib/firebase)");
        } else {
            console.log("[AppCheck] 🛑 Disabled (Feature Flag)");
        }
    }, []);

    return <>{children}</>;
}
