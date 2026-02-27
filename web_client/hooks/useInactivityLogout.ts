'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface InactivityConfig {
    /** Inactivity timeout in minutes (default: 30) */
    timeoutMinutes?: number;
    /** Warning time in minutes before logout (default: 2) */
    warningMinutes?: number;
    /** Callback when user should be logged out */
    onLogout: () => void;
    /** Whether to enable inactivity detection (default: true) */
    enabled?: boolean;
}

interface InactivityState {
    /** Whether warning dialog should be shown */
    showWarning: boolean;
    /** Seconds remaining until logout */
    secondsRemaining: number;
    /** Reset the inactivity timer */
    resetTimer: () => void;
    /** Extend the session (dismiss warning) */
    extendSession: () => void;
}

/**
 * Inactivity Detection Hook
 * 
 * Monitors user activity and triggers auto-logout after specified inactivity period.
 * Shows a warning dialog before logout to allow session extension.
 * 
 * Activity events monitored: mousemove, keydown, touchstart, scroll, click
 * 
 * @example
 * const { showWarning, secondsRemaining, extendSession } = useInactivityLogout({
 *   timeoutMinutes: 30,
 *   warningMinutes: 2,
 *   onLogout: () => logout()
 * });
 */
export function useInactivityLogout(config: InactivityConfig): InactivityState {
    const {
        timeoutMinutes = parseInt(process.env.NEXT_PUBLIC_INACTIVITY_TIMEOUT_MINUTES || '30', 10),
        warningMinutes = parseInt(process.env.NEXT_PUBLIC_LOGOUT_WARNING_MINUTES || '2', 10),
        onLogout,
        enabled = true,
    } = config;

    const [showWarning, setShowWarning] = useState(false);
    const [secondsRemaining, setSecondsRemaining] = useState(0);

    const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
    const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
    const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const showWarningRef = useRef(false); // Ref mirror to avoid effect re-subscription on state change

    const clearAllTimers = useCallback(() => {
        if (inactivityTimerRef.current) {
            clearTimeout(inactivityTimerRef.current);
            inactivityTimerRef.current = null;
        }
        if (warningTimerRef.current) {
            clearTimeout(warningTimerRef.current);
            warningTimerRef.current = null;
        }
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }
    }, []);

    const startCountdown = useCallback(() => {
        let seconds = warningMinutes * 60;
        setSecondsRemaining(seconds);
        showWarningRef.current = true;
        setShowWarning(true);

        // Update countdown every second
        countdownIntervalRef.current = setInterval(() => {
            seconds -= 1;
            setSecondsRemaining(seconds);

            if (seconds <= 0) {
                clearAllTimers();
                setShowWarning(false);
                console.log('[InactivityLogout] ⏰ Session expired - logging out');
                onLogout();
            }
        }, 1000);
    }, [warningMinutes, onLogout, clearAllTimers]);

    const resetTimer = useCallback(() => {
        clearAllTimers();
        showWarningRef.current = false;
        setShowWarning(false);

        if (!enabled) return;

        // Calculate warning time (timeout - warning margin)
        const warningTimeMs = (timeoutMinutes - warningMinutes) * 60 * 1000;

        // Schedule warning dialog
        warningTimerRef.current = setTimeout(() => {
            if (process.env.NODE_ENV === 'development') {
                console.log('[InactivityLogout] ⚠️ Showing inactivity warning');
            }
            startCountdown();
        }, warningTimeMs);

        if (process.env.NODE_ENV === 'development') {
            console.log(
                `[InactivityLogout] Timer reset. Warning will show in ${timeoutMinutes - warningMinutes} minutes.`
            );
        }
    }, [enabled, timeoutMinutes, warningMinutes, clearAllTimers, startCountdown]);

    const extendSession = useCallback(() => {
        resetTimer();
    }, [resetTimer]);

    // Store resetTimer in a ref so the event listener effect doesn't need
    // it as a dependency (avoids infinite effect re-mount loop).
    const resetTimerRef = useRef(resetTimer);
    useEffect(() => {
        resetTimerRef.current = resetTimer;
    }, [resetTimer]);

    // Monitor activity events
    useEffect(() => {
        if (!enabled) return;

        const activityEvents = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
        let lastActivity = Date.now();

        const handleActivity = () => {
            const now = Date.now();
            // Throttle: activity relevant for a 30-min timeout doesn't need sub-minute resolution
            if (now - lastActivity > 60_000) {
                lastActivity = now;
                if (!showWarningRef.current) {
                    resetTimerRef.current();
                }
            }
        };

        // Register event listeners
        activityEvents.forEach(event => {
            window.addEventListener(event, handleActivity, { passive: true });
        });

        // Initial timer start
        resetTimerRef.current();

        // Cleanup
        return () => {
            activityEvents.forEach(event => {
                window.removeEventListener(event, handleActivity);
            });
            clearAllTimers();
        };
         
    }, [enabled, clearAllTimers]); // resetTimer intentionally excluded — accessed via ref

    return {
        showWarning,
        secondsRemaining,
        resetTimer,
        extendSession,
    };
}
