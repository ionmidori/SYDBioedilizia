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
});
