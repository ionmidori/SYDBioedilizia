import { act, renderHook } from '@testing-library/react';
import { useSmoothText } from '../useSmoothText';

const mockReducedMotion = jest.fn(() => false);
jest.mock('framer-motion', () => ({
    useReducedMotion: () => mockReducedMotion(),
}));

const REPLY = 'Per rifare un bagno di 6 mq servono demolizione, impianti, massetto e posa.';

beforeEach(() => {
    jest.useFakeTimers();
    mockReducedMotion.mockReturnValue(false);
});

afterEach(() => {
    jest.useRealTimers();
});

describe('useSmoothText', () => {
    it('reveals a reply that arrived at once progressively, then in full', () => {
        const { result } = renderHook(({ t }) => useSmoothText(t, true), { initialProps: { t: REPLY } });
        expect(result.current).toBe('');

        act(() => { jest.advanceTimersByTime(48); }); // a few frames
        expect(result.current.length).toBeGreaterThan(0);
        expect(result.current.length).toBeLessThan(REPLY.length);
        expect(REPLY.startsWith(result.current)).toBe(true);

        act(() => { jest.advanceTimersByTime(600); }); // > DRAIN_MS
        expect(result.current).toBe(REPLY);
    });

    it('never holds content back longer than the drain window', () => {
        const long = REPLY.repeat(40); // ~3,000 chars at once
        const { result } = renderHook(() => useSmoothText(long, true));
        act(() => { jest.advanceTimersByTime(500); });
        expect(result.current).toBe(long);
    });

    it('shows history (animate=false) immediately', () => {
        const { result } = renderHook(() => useSmoothText(REPLY, false));
        expect(result.current).toBe(REPLY);
    });

    it('respects reduced motion', () => {
        mockReducedMotion.mockReturnValue(true);
        const { result } = renderHook(() => useSmoothText(REPLY, true));
        expect(result.current).toBe(REPLY);
    });

    it('shows a retraction (text that is not an extension) at once', () => {
        const { result, rerender } = renderHook(({ t }) => useSmoothText(t, true), { initialProps: { t: REPLY } });
        act(() => { jest.advanceTimersByTime(600); });
        rerender({ t: 'Risposta filtrata.' });
        act(() => { jest.advanceTimersByTime(16); });
        expect(result.current).toBe('Risposta filtrata.');
    });
});
