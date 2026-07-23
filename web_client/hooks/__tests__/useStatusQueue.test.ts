import { act, renderHook } from '@testing-library/react';
import { useStatusQueue } from '../useStatusQueue';

// MIN_DISPLAY_MS in the hook
const TICK = 800;

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('useStatusQueue', () => {
    it('starts with no status', () => {
        const { result } = renderHook(() => useStatusQueue());
        expect(result.current.currentStatus).toBeNull();
    });

    it('shows a status immediately', () => {
        const { result } = renderHook(() => useStatusQueue());

        act(() => result.current.addStatus('Analizzo la planimetria...'));

        expect(result.current.currentStatus).toBe('Analizzo la planimetria...');
    });

    it('holds each message for the minimum display time', () => {
        const { result } = renderHook(() => useStatusQueue());

        act(() => {
            result.current.addStatus('Primo');
            result.current.addStatus('Secondo');
        });
        expect(result.current.currentStatus).toBe('Primo');

        act(() => jest.advanceTimersByTime(TICK));
        expect(result.current.currentStatus).toBe('Secondo');

        // Queue drained: after the last hold the status clears
        act(() => jest.advanceTimersByTime(TICK));
        expect(result.current.currentStatus).toBeNull();
    });

    it('skips consecutive duplicates while they wait in the queue', () => {
        const { result } = renderHook(() => useStatusQueue());

        act(() => result.current.addStatus('Primo')); // shown, lock held
        act(() => {
            result.current.addStatus('Stesso'); // queued behind Primo
            result.current.addStatus('Stesso'); // tail duplicate -> dropped
        });

        act(() => jest.advanceTimersByTime(TICK));
        expect(result.current.currentStatus).toBe('Stesso');

        // Only one copy was queued: the next tick clears instead of repeating
        act(() => jest.advanceTimersByTime(TICK));
        expect(result.current.currentStatus).toBeNull();
    });

    it('ignores re-adding the message currently on screen', () => {
        const { result } = renderHook(() => useStatusQueue());

        act(() => result.current.addStatus('Attivo'));
        act(() => result.current.addStatus('Attivo')); // shown right now -> dropped

        act(() => jest.advanceTimersByTime(TICK));
        // Nothing was queued behind it, so the status clears
        expect(result.current.currentStatus).toBeNull();
    });

    it('clearQueue wipes everything at once', () => {
        const { result } = renderHook(() => useStatusQueue());

        act(() => {
            result.current.addStatus('Primo');
            result.current.addStatus('Secondo');
            result.current.clearQueue();
        });

        expect(result.current.currentStatus).toBeNull();
        act(() => jest.advanceTimersByTime(TICK * 3));
        expect(result.current.currentStatus).toBeNull();
    });
});
