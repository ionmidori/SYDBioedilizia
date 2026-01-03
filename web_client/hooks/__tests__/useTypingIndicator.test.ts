import { renderHook } from '@testing-library/react';
import { useTypingIndicator } from '../useTypingIndicator';
import { act } from 'react';

describe('useTypingIndicator', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should return default message when not loading', () => {
        const { result } = renderHook(() => useTypingIndicator(false));

        expect(result.current).toBe('Sto pensando...');
    });

    it('should return first message when loading starts', () => {
        const { result } = renderHook(() => useTypingIndicator(true));

        expect(result.current).toBe('Sto analizzando...');
    });

    it('should cycle through messages when loading', () => {
        const { result } = renderHook(() => useTypingIndicator(true));

        expect(result.current).toBe('Sto analizzando...');

        act(() => {
            jest.advanceTimersByTime(2000);
        });
        expect(result.current).toBe('Sto elaborando la risposta...');

        act(() => {
            jest.advanceTimersByTime(2000);
        });
        expect(result.current).toBe('Sto disegnando...');

        act(() => {
            jest.advanceTimersByTime(2000);
        });
        expect(result.current).toBe('Quasi pronto...');
    });

    it('should loop back to first message after last one', () => {
        const { result } = renderHook(() => useTypingIndicator(true));

        // Advance through all 4 messages (0, 2000, 4000, 6000ms)
        act(() => {
            jest.advanceTimersByTime(8000);
        });

        // Should loop back to first message
        expect(result.current).toBe('Sto analizzando...');
    });

    it('should stop cycling when loading ends', () => {
        const { result, rerender } = renderHook(
            ({ isLoading }) => useTypingIndicator(isLoading),
            { initialProps: { isLoading: true } }
        );

        expect(result.current).toBe('Sto analizzando...');

        // Stop loading
        rerender({ isLoading: false });

        expect(result.current).toBe('Sto pensando...');

        // Advance time - message should not change
        act(() => {
            jest.advanceTimersByTime(5000);
        });
        expect(result.current).toBe('Sto pensando...');
    });

    it('should clean up interval on unmount', () => {
        const { unmount } = renderHook(() => useTypingIndicator(true));

        const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

        unmount();

        expect(clearIntervalSpy).toHaveBeenCalled();
        clearIntervalSpy.mockRestore();
    });

    it('should restart cycling when loading restarts', () => {
        const { result, rerender } = renderHook(
            ({ isLoading }) => useTypingIndicator(isLoading),
            { initialProps: { isLoading: true } }
        );

        // Advance to second message
        act(() => {
            jest.advanceTimersByTime(2000);
        });
        expect(result.current).toBe('Sto elaborando la risposta...');

        // Stop loading
        rerender({ isLoading: false });
        expect(result.current).toBe('Sto pensando...');

        // Start loading again
        rerender({ isLoading: true });
        expect(result.current).toBe('Sto analizzando...'); // Should restart from first
    });
});
