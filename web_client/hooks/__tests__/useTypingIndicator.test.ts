import { renderHook } from '@testing-library/react';
import { useTypingIndicator } from '../useTypingIndicator';
import { act } from 'react';

describe('useTypingIndicator', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        // The hook picks its starting index via crypto.getRandomValues; force it
        // to 0 so message cycling is deterministic in tests.
        jest.spyOn(crypto, 'getRandomValues').mockImplementation((arr) => {
            if (arr) new Uint32Array(arr.buffer).fill(0);
            return arr;
        });
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
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
        expect(result.current).toBe("Spostando mobili immaginari...");

        act(() => {
            jest.advanceTimersByTime(3000);
        });
        expect(result.current).toBe("Litigando con l'idraulico virtuale...");
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
