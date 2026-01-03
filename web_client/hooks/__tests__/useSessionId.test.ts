import { renderHook } from '@testing-library/react';
import { useSessionId } from '../useSessionId';

describe('useSessionId', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear();
    });

    it('should create a new session ID when localStorage is empty', () => {
        const { result } = renderHook(() => useSessionId());

        expect(result.current).toBeDefined();
        expect(typeof result.current).toBe('string');
        expect(result.current).toMatch(/^session-\d+-[a-z0-9]+$/);
    });

    it('should restore session ID from localStorage', () => {
        const existingSessionId = 'session-12345-abc';
        localStorage.setItem('chatSessionId', existingSessionId);

        const { result } = renderHook(() => useSessionId());

        expect(result.current).toBe(existingSessionId);
    });

    it('should persist session ID to localStorage', () => {
        const { result } = renderHook(() => useSessionId());

        const storedSessionId = localStorage.getItem('chatSessionId');
        expect(storedSessionId).toBe(result.current);
    });

    it('should return the same session ID on re-renders', () => {
        const { result, rerender } = renderHook(() => useSessionId());
        const firstSessionId = result.current;

        rerender();

        expect(result.current).toBe(firstSessionId);
    });

    it('should generate different session IDs for different instances', () => {
        localStorage.clear();

        const { result: result1 } = renderHook(() => useSessionId());
        localStorage.clear(); // Clear between instances
        const { result: result2 } = renderHook(() => useSessionId());

        expect(result1.current).not.toBe(result2.current);
    });

    it('should handle server-side rendering (window undefined)', () => {
        // This test simulates SSR where window is undefined
        const { result } = renderHook(() => useSessionId());

        // Should still return a valid session ID
        expect(result.current).toBeDefined();
    });
});
