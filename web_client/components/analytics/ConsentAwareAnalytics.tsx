"use client";

import { useEffect } from 'react';
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { CookieManager } from '@/lib/cookie-manager';

function filterAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
    return CookieManager.isAllowed('analytics') ? event : null;
}

/**
 * Mounts Vercel Web Analytics and Speed Insights only when the user has
 * explicitly granted `analytics` cookie consent, and immediately disables
 * already-injected scripts if consent is withdrawn mid-session.
 */
export function ConsentAwareAnalytics() {
    const { consent, isInitialized } = useCookieConsent();
    const analyticsAllowed = isInitialized && consent?.analytics === true;

    useEffect(() => {
        if (!isInitialized || analyticsAllowed || typeof window === 'undefined') {
            return;
        }
        window.va?.('beforeSend', () => null);
        window.si?.('beforeSend', () => null);
    }, [isInitialized, analyticsAllowed]);

    if (!analyticsAllowed) {
        return null;
    }

    return (
        <>
            <SpeedInsights
                beforeSend={(event) => (CookieManager.isAllowed('analytics') ? event : null)}
            />
            <Analytics beforeSend={filterAnalyticsEvent} />
        </>
    );
}
