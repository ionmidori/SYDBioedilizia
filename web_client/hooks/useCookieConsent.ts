"use client";

import { useState, useEffect } from 'react';
import { CookieManager, CookieCategory } from '@/lib/cookie-manager';

export function useCookieConsent() {
    const [consent, setConsent] = useState<Record<CookieCategory, boolean> | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        // Initial load using setTimeout to avoid sync setState warning in effect
        const timer = setTimeout(() => {
            setConsent(CookieManager.getConsent());
            setIsInitialized(true);
        }, 0);

        // Listen for updates from other parts of the app
        const handleUpdate = (e: Event) => {
            const customEvent = e as CustomEvent<Record<CookieCategory, boolean>>;
            if (customEvent.detail) {
                setConsent(customEvent.detail);
            }
        };

        window.addEventListener('cookie_consent_updated', handleUpdate);
        
        return () => {
            clearTimeout(timer);
            window.removeEventListener('cookie_consent_updated', handleUpdate);
        };
    }, []);

    const updateConsent = (newConsent: Record<CookieCategory, boolean>) => {
        CookieManager.setConsent(newConsent);
        setConsent(newConsent);
    };

    const acceptAll = () => {
        const allAccepted: Record<CookieCategory, boolean> = {
            essential: true,
            analytics: true,
            marketing: true
        };
        updateConsent(allAccepted);
    };

    const declineAll = () => {
        const allDeclined: Record<CookieCategory, boolean> = {
            essential: true,
            analytics: false,
            marketing: false
        };
        updateConsent(allDeclined);
    };

    return {
        consent,
        isInitialized,
        updateConsent,
        acceptAll,
        declineAll,
        isAllowed: (category: CookieCategory) => CookieManager.isAllowed(category)
    };
}
