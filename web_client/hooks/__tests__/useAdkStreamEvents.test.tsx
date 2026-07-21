import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useAdkStreamEvents } from '../useAdkStreamEvents';

/** Capture every CustomEvent dispatched on window for the given names. */
function listenFor(...names: string[]) {
    const seen: Array<{ name: string; detail: unknown }> = [];
    const handlers = names.map((name) => {
        const handler = (e: Event) => seen.push({ name, detail: (e as CustomEvent).detail });
        window.addEventListener(name, handler);
        return () => window.removeEventListener(name, handler);
    });
    return { seen, cleanup: () => handlers.forEach((off) => off()) };
}

describe('useAdkStreamEvents', () => {
    it('unwraps the backend envelope before accumulating', () => {
        const { result } = renderHook(() => useAdkStreamEvents('s1'));

        // The backend nests the legacy event (which carries its own `type`)
        // inside dataPart.data.
        act(() => { result.current.onData({ type: 'data-adk', data: { type: 'status', payload: 'x' } }); });

        expect(result.current.streamData).toEqual([{ type: 'status', payload: 'x' }]);
    });

    it('ignores parts without an object payload', () => {
        const { result } = renderHook(() => useAdkStreamEvents('s1'));

        act(() => {
            result.current.onData({ type: 'data-adk' });
            result.current.onData({ data: null });
            result.current.onData({ data: 'not-an-object' });
            result.current.onData(null);
            result.current.onData('not-an-object');
        });

        expect(result.current.streamData).toEqual([]);
    });

    it.each([
        ['interrupt', 'adk-interrupt'],
        ['ui_widget', 'adk-ui-widget'],
        ['artifact', 'adk-artifact'],
    ])('dispatches %s as the %s DOM event', (type, eventName) => {
        const { seen, cleanup } = listenFor(eventName);
        const { result } = renderHook(() => useAdkStreamEvents('s1'));

        act(() => { result.current.onData({ data: { type, payload: { id: 42 } } }); });

        expect(seen).toHaveLength(1);
        // `interrupt` forwards only the payload; the others forward the whole event.
        expect(seen[0].detail).toEqual(
            type === 'interrupt' ? { id: 42 } : { type, payload: { id: 42 } }
        );
        cleanup();
    });

    it('does not dispatch for unrelated event types', () => {
        const { seen, cleanup } = listenFor('adk-interrupt', 'adk-ui-widget', 'adk-artifact');
        const { result } = renderHook(() => useAdkStreamEvents('s1'));

        act(() => { result.current.onData({ data: { type: 'status', payload: 'thinking' } }); });

        expect(seen).toHaveLength(0);
        cleanup();
    });

    it('dispatches every event when several arrive in one render batch', () => {
        // The SDK drains a stream chunk synchronously, so two data parts can land
        // in the same React batch: one re-render, one effect run. Reacting only to
        // the last element of streamData silently drops the earlier ones — an
        // `interrupt` swallowed here would stall the HITL flow.
        const { seen, cleanup } = listenFor('adk-interrupt', 'adk-ui-widget');
        const { result } = renderHook(() => useAdkStreamEvents('s1'));

        act(() => {
            result.current.onData({ data: { type: 'interrupt', payload: { id: 1 } } });
            result.current.onData({ data: { type: 'ui_widget', payload: { id: 2 } } });
        });

        expect(seen.map((e) => e.name)).toEqual(['adk-interrupt', 'adk-ui-widget']);
        cleanup();
    });

    it('drops accumulated events when the session changes', () => {
        const { result, rerender } = renderHook(({ id }) => useAdkStreamEvents(id), {
            initialProps: { id: 's1' },
        });

        act(() => { result.current.onData({ data: { type: 'status', payload: 'x' } }); });
        expect(result.current.streamData).toHaveLength(1);

        rerender({ id: 's2' });

        expect(result.current.streamData).toEqual([]);
    });

    it('still dispatches the first event of a new session', () => {
        // Guards the cursor reset: without it the counter stays ahead of the
        // emptied array and the new session's first event is never broadcast.
        const { seen, cleanup } = listenFor('adk-artifact');
        const { result, rerender } = renderHook(({ id }) => useAdkStreamEvents(id), {
            initialProps: { id: 's1' },
        });

        act(() => { result.current.onData({ data: { type: 'artifact', payload: { id: 1 } } }); });
        expect(seen).toHaveLength(1);

        rerender({ id: 's2' });
        act(() => { result.current.onData({ data: { type: 'artifact', payload: { id: 2 } } }); });

        expect(seen).toHaveLength(2);
        cleanup();
    });
});
