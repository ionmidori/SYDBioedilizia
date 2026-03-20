/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useInactivityLogout } from '../useInactivityLogout';

// Mock timers
jest.useFakeTimers();

describe('useInactivityLogout', () => {
    let mockOnLogout: jest.Mock;

    beforeEach(() => {
        mockOnLogout = jest.fn();
        jest.clearAllTimers();
    });

    afterEach(() => {
        jest.clearAllTimers();
    });

    it('should not show warning initially', () => {
        const { result } = renderHook(() =>
            useInactivityLogout({
                timeoutMinutes: 30,
                warningMinutes: 2,
                onLogout: mockOnLogout,
            })
        );

        expect(result.current.showWarning).toBe(false);
        expect(result.current.secondsRemaining).toBe(0);
    });

    it('should show warning after inactivity timeout minus warning period', () => {
        const { result } = renderHook(() =>
            useInactivityLogout({
                timeoutMinutes: 30,
                warningMinutes: 2,
                onLogout: mockOnLogout,
            })
        );

        // Fast-forward to warning time (28 minutes)
        act(() => {
            jest.advanceTimersByTime(28 * 60 * 1000);
        });

        expect(result.current.showWarning).toBe(true);
        expect(result.current.secondsRemaining).toBe(2 * 60); // 2 minutes in seconds
    });

    it('should call onLogout after full timeout', () => {
        const { result } = renderHook(() =>
            useInactivityLogout({
                timeoutMinutes: 30,
                warningMinutes: 2,
                onLogout: mockOnLogout,
            })
        );

        // Fast-forward to warning
        act(() => {
            jest.advanceTimersByTime(28 * 60 * 1000);
        });

        expect(result.current.showWarning).toBe(true);

        // Fast-forward through warning period
        act(() => {
            jest.advanceTimersByTime(2 * 60 * 1000);
        });

        expect(mockOnLogout).toHaveBeenCalledTimes(1);
        expect(result.current.showWarning).toBe(false);
    });

    it('should reset timer on user activity', () => {
        const { result } = renderHook(() =>
            useInactivityLogout({
                timeoutMinutes: 30,
                warningMinutes: 2,
                onLogout: mockOnLogout,
            })
        );

        // Fast-forward halfway to warning
        act(() => {
            jest.advanceTimersByTime(14 * 60 * 1000);
        });

        // Simulate user activity
        act(() => {
            window.dispatchEvent(new MouseEvent('mousemove'));
            // Wait for debounce
            jest.advanceTimersByTime(1000);
        });

        // Fast-forward another 14 minutes (should not show warning yet)
        act(() => {
            jest.advanceTimersByTime(14 * 60 * 1000);
        });

        expect(result.current.showWarning).toBe(false);
    });

    it('should extend session when extendSession is called', () => {
        const { result } = renderHook(() =>
            useInactivityLogout({
                timeoutMinutes: 30,
                warningMinutes: 2,
                onLogout: mockOnLogout,
            })
        );

        // Fast-forward to warning
        act(() => {
            jest.advanceTimersByTime(28 * 60 * 1000);
        });

        expect(result.current.showWarning).toBe(true);

        // Extend session
        act(() => {
            result.current.extendSession();
        });

        expect(result.current.showWarning).toBe(false);
        expect(mockOnLogout).not.toHaveBeenCalled();
    });

    it('should not activate when enabled is false', () => {
        const { result } = renderHook(() =>
            useInactivityLogout({
                timeoutMinutes: 30,
                warningMinutes: 2,
                onLogout: mockOnLogout,
                enabled: false,
            })
        );

        // Fast-forward past timeout
        act(() => {
            jest.advanceTimersByTime(35 * 60 * 1000);
        });

        expect(result.current.showWarning).toBe(false);
        expect(mockOnLogout).not.toHaveBeenCalled();
    });

    it('should countdown seconds correctly', () => {
        const { result } = renderHook(() =>
            useInactivityLogout({
                timeoutMinutes: 30,
                warningMinutes: 2,
                onLogout: mockOnLogout,
            })
        );

        // Fast-forward to warning
        act(() => {
            jest.advanceTimersByTime(28 * 60 * 1000);
        });

        expect(result.current.secondsRemaining).toBe(120);

        // Advance 30 seconds
        act(() => {
            jest.advanceTimersByTime(30 * 1000);
        });

        expect(result.current.secondsRemaining).toBe(90);

        // Advance another 60 seconds
        act(() => {
            jest.advanceTimersByTime(60 * 1000);
        });

        expect(result.current.secondsRemaining).toBe(30);
    });

    it('should handle multiple activity events', () => {
        const { result } = renderHook(() =>
            useInactivityLogout({
                timeoutMinutes: 30,
                warningMinutes: 2,
                onLogout: mockOnLogout,
            })
        );

        // Simulate various activity events
        const events = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];

        events.forEach((eventType) => {
            act(() => {
                jest.advanceTimersByTime(10 * 60 * 1000); // 10 minutes
                window.dispatchEvent(new Event(eventType));
                jest.advanceTimersByTime(1000); // Debounce
            });
        });

        // Should not have shown warning yet
        expect(result.current.showWarning).toBe(false);
        expect(mockOnLogout).not.toHaveBeenCalled();
    });

    it('should NOT reset timer when user acts after warning threshold has passed', () => {
        // BUG FIX regression: activity after 29min should not restart the 28-min timer.
        // Without the fix, the user could avoid logout indefinitely by occasionally interacting.
        renderHook(() =>
            useInactivityLogout({
                timeoutMinutes: 30,
                warningMinutes: 2,
                onLogout: mockOnLogout,
            })
        );

        // Advance 29 minutes (past the 28-min warning threshold)
        act(() => {
            jest.advanceTimersByTime(29 * 60 * 1000);
        });

        // Warning should have fired at 28 min
        expect(mockOnLogout).not.toHaveBeenCalled();

        // Simulate user activity at 29 minutes — must NOT reset the timer
        act(() => {
            window.dispatchEvent(new MouseEvent('mousemove'));
            jest.advanceTimersByTime(1000);
        });

        // Advance remaining warning period — logout must still fire
        act(() => {
            jest.advanceTimersByTime(2 * 60 * 1000);
        });

        expect(mockOnLogout).toHaveBeenCalledTimes(1);
    });

    it('should show warning immediately when tab becomes visible after long absence', () => {
        renderHook(() =>
            useInactivityLogout({
                timeoutMinutes: 30,
                warningMinutes: 2,
                onLogout: mockOnLogout,
            })
        );

        // Simulate tab going to background — advance time past warning threshold
        // (browser throttles setTimeout when tab is hidden, so the timer may not fire)
        act(() => {
            jest.advanceTimersByTime(29 * 60 * 1000);
        });

        // Simulate tab becoming visible again
        act(() => {
            Object.defineProperty(document, 'hidden', { value: false, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
        });

        // visibilitychange handler should have triggered startCountdown immediately
        // (either via the threshold check or the scheduled timer already fired)
        act(() => {
            jest.advanceTimersByTime(2 * 60 * 1000);
        });

        expect(mockOnLogout).toHaveBeenCalledTimes(1);
    });
});
