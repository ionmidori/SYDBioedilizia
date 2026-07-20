'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

/**
 * Global App Check Provider
 * Initializes Firebase App Check (ReCaptcha V3) to protect against bots.
 */
export function AppCheckProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        if (typeof window === 'undefined') return;

        if (process.env.NEXT_PUBLIC_ENABLE_APP_CHECK === 'true') {
            logger.debug("[AppCheck] 🛡️ Active (Managed via lib/firebase)");
        } else {
            logger.debug("[AppCheck] 🛑 Disabled (Feature Flag)");
        }
    }, []);

    return <>{children}</>;
}
