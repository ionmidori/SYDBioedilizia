import { renderHook } from '@testing-library/react';
import { useTypingIndicator } from '../useTypingIndicator';
import { act } from 'react';

describe('useTypingIndicator', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(Math, 'random').mockReturnValue(0); // Always start at index 0
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.spyOn(Math, 'random').mockRestore();
    });

    it('should return default message when not loading', () => {
        const { result } = renderHook(() => useTypingIndicator(false));

        expect(result.current).toBe("Consultando l'architetto interiore...");
    });

    it('should return first message when loading starts', () => {
        const { result } = renderHook(() => useTypingIndicator(true));

        expect(result.current).toBe("Consultando l'architetto interiore...");
    });

    it('should cycle through messages when loading', () => {
        const { result } = renderHook(() => useTypingIndicator(true));

        expect(result.current).toBe("Consultando l'architetto interiore...");

        act(() => {
            jest.advanceTimersByTime(3000);
        });
        expect(result.current).toBe("Spostando pixel pesanti...");

        act(() => {
            jest.advanceTimersByTime(3000);
        });
        expect(result.current).toBe("Riscaldando i neuroni...");
    });

    it('should stop cycling when loading ends', () => {
        const { result, rerender } = renderHook(
            ({ isLoading }) => useTypingIndicator(isLoading),
            { initialProps: { isLoading: true } }
        );

        expect(result.current).toBe("Consultando l'architetto interiore...");

        // Stop loading
        rerender({ isLoading: false });

        expect(result.current).toBe("Consultando l'architetto interiore...");

        // Advance time - message should not change
        act(() => {
            jest.advanceTimersByTime(5000);
        });
        expect(result.current).toBe("Consultando l'architetto interiore...");
    });

    it('should clean up interval on unmount', () => {
        const { unmount } = renderHook(() => useTypingIndicator(true));

        const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

        unmount();

        expect(clearIntervalSpy).toHaveBeenCalled();
        clearIntervalSpy.mockRestore();
    });
});
