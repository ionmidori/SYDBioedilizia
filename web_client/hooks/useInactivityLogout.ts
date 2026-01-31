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
        setShowWarning(false);

        if (!enabled) return;

        // Calculate warning time (timeout - warning margin)
        const warningTimeMs = (timeoutMinutes - warningMinutes) * 60 * 1000;

        // Schedule warning dialog
        warningTimerRef.current = setTimeout(() => {
            console.log('[InactivityLogout] ⚠️ Showing inactivity warning');
            startCountdown();
        }, warningTimeMs);

        console.log(
            `[InactivityLogout] Timer reset. Warning will show in ${timeoutMinutes - warningMinutes} minutes.`
        );
    }, [enabled, timeoutMinutes, warningMinutes, clearAllTimers, startCountdown]);

    const extendSession = useCallback(() => {
        console.log('[InactivityLogout] ✅ Session extended by user');
        resetTimer();
    }, [resetTimer]);

    // Monitor activity events
    useEffect(() => {
        if (!enabled) return;

        const activityEvents = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
        let lastActivity = Date.now();
        let throttleTimer: NodeJS.Timeout | null = null;

        const handleActivity = () => {
            const now = Date.now();
            // Throttle to run max once per second
            if (now - lastActivity > 1000) {
                lastActivity = now;
                if (!showWarning) {
                    resetTimer();
                }
            }
        };

        // Register event listeners
        activityEvents.forEach(event => {
            window.addEventListener(event, handleActivity, { passive: true });
        });

        // Initial timer start
        resetTimer();

        // Cleanup
        return () => {
            activityEvents.forEach(event => {
                window.removeEventListener(event, handleActivity);
            });
            if (throttleTimer) clearTimeout(throttleTimer);
            clearAllTimers();
        };
    }, [enabled, resetTimer, showWarning, clearAllTimers]);

    return {
        showWarning,
        secondsRemaining,
        resetTimer,
        extendSession,
    };
}
