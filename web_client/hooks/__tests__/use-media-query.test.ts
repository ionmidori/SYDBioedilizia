import { act, renderHook } from '@testing-library/react';
import { useMediaQuery } from '../use-media-query';

type ChangeListener = () => void;

/** Controllable matchMedia stub over the jest.setup.js default. */
function stubMatchMedia(matches: boolean) {
    const listeners: ChangeListener[] = [];
    const mql = {
        matches,
        media: '',
        addEventListener: (_type: string, cb: ChangeListener) => listeners.push(cb),
        removeEventListener: (_type: string, cb: ChangeListener) => {
            const i = listeners.indexOf(cb);
            if (i >= 0) listeners.splice(i, 1);
        },
    };
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({ ...mql, media: query }));
    return {
        setMatches(next: boolean) {
            mql.matches = next;
            listeners.forEach((cb) => cb());
        },
        listeners,
    };
}

describe('useMediaQuery', () => {
    it('reads the current match state', () => {
        stubMatchMedia(true);
        const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
        expect(result.current).toBe(true);
    });

    it('reports false when the query does not match', () => {
        stubMatchMedia(false);
        const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
        expect(result.current).toBe(false);
    });

    it('re-renders when the media query flips', () => {
        const control = stubMatchMedia(false);
        const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

        act(() => control.setMatches(true));

        expect(result.current).toBe(true);
    });

    it('unsubscribes on unmount', () => {
        const control = stubMatchMedia(false);
        const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));

        expect(control.listeners.length).toBeGreaterThan(0);
        unmount();
        expect(control.listeners).toHaveLength(0);
    });
});
