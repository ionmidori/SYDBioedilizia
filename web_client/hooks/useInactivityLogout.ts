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
 * Handles two edge cases that the naive setTimeout approach misses:
 * 1. User returns after long absence and moves mouse — timer must NOT reset past warning threshold
 * 2. Tab goes to background (visibilitychange) — on return, elapsed time is checked immediately
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

    const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
    const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const showWarningRef = useRef(false);

    // Stable refs so inner closures always call the latest version without
    // needing them as effect dependencies (avoids effect re-mount loop).
    const timeoutMinutesRef = useRef(timeoutMinutes);
    const warningMinutesRef = useRef(warningMinutes);
    timeoutMinutesRef.current = timeoutMinutes;
    warningMinutesRef.current = warningMinutes;

    const clearAllTimers = useCallback(() => {
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
        let seconds = warningMinutesRef.current * 60;
        setSecondsRemaining(seconds);
        showWarningRef.current = true;
        setShowWarning(true);

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
    }, [onLogout, clearAllTimers]);

    const resetTimer = useCallback(() => {
        clearAllTimers();
        showWarningRef.current = false;
        setShowWarning(false);

        if (!enabled) return;

        const warningTimeMs = (timeoutMinutesRef.current - warningMinutesRef.current) * 60 * 1000;

        warningTimerRef.current = setTimeout(() => {
            if (process.env.NODE_ENV === 'development') {
                console.log('[InactivityLogout] ⚠️ Showing inactivity warning');
            }
            startCountdown();
        }, warningTimeMs);

        if (process.env.NODE_ENV === 'development') {
            console.log(
                `[InactivityLogout] Timer reset. Warning in ${timeoutMinutesRef.current - warningMinutesRef.current}m.`
            );
        }
    }, [enabled, clearAllTimers, startCountdown]);

    const extendSession = useCallback(() => {
        resetTimer();
    }, [resetTimer]);

    // Stable ref so the effect closure always calls the latest resetTimer / startCountdown
    const resetTimerRef = useRef(resetTimer);
    useEffect(() => {
        resetTimerRef.current = resetTimer;
    }, [resetTimer]);

    const startCountdownRef = useRef(startCountdown);
    useEffect(() => {
        startCountdownRef.current = startCountdown;
    }, [startCountdown]);

    // Monitor activity events + page visibility
    useEffect(() => {
        if (!enabled) return;

        const activityEvents = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
        let lastActivity = Date.now();

        const handleActivity = () => {
            if (showWarningRef.current) return; // warning already visible — ignore activity

            const now = Date.now();
            const elapsed = now - lastActivity;

            if (elapsed < 60_000) return; // throttle: only recalculate once per minute

            const warningThresholdMs =
                (timeoutMinutesRef.current - warningMinutesRef.current) * 60_000;

            // BUG FIX: if we are already past the warning threshold, do NOT reset the timer.
            // The scheduled setTimeout will fire (possibly with minor browser delay).
            // Resetting here would give the user an extra full timeout cycle — effectively
            // preventing logout as long as they occasionally interact with the page.
            if (elapsed >= warningThresholdMs) return;

            lastActivity = now;
            resetTimerRef.current();
        };

        // BUG FIX: handle page visibility changes.
        // When a browser tab goes to background, setTimeout/setInterval are throttled
        // aggressively (Chrome: 1-min minimum; some browsers pause entirely).
        // On return, we proactively check elapsed time so the user is not silently
        // granted an extra timeout cycle just because they switched tabs.
        const handleVisibilityChange = () => {
            if (document.hidden || showWarningRef.current) return;

            const now = Date.now();
            const elapsed = now - lastActivity;
            const warningThresholdMs =
                (timeoutMinutesRef.current - warningMinutesRef.current) * 60_000;
            const logoutThresholdMs = timeoutMinutesRef.current * 60_000;

            if (elapsed >= logoutThresholdMs) {
                // Full timeout elapsed while hidden — show warning (not instant logout,
                // to give the user a chance to extend if they're back at the computer).
                clearAllTimers();
                startCountdownRef.current();
            } else if (elapsed >= warningThresholdMs) {
                // Past warning threshold — start countdown immediately.
                clearAllTimers();
                startCountdownRef.current();
            }
            // else: tab was hidden for a short time, existing timer is still accurate.
        };

        activityEvents.forEach(event => {
            window.addEventListener(event, handleActivity, { passive: true });
        });
        document.addEventListener('visibilitychange', handleVisibilityChange);

        resetTimerRef.current();

        return () => {
            activityEvents.forEach(event => {
                window.removeEventListener(event, handleActivity);
            });
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearAllTimers();
        };
    }, [enabled, clearAllTimers]); // resetTimer/startCountdown accessed via refs — intentionally excluded

    return {
        showWarning,
        secondsRemaining,
        resetTimer,
        extendSession,
    };
}
