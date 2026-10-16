import { act, renderHook } from '@testing-library/react';
import { isStreamNotice, useStreamNotice } from '../useStreamNotice';

const notice = (message: string, code = 'VIDEO_SKIPPED') => ({ type: 'notice', level: 'warning', code, message });
const status = (message: string) => ({ type: 'status', message });

describe('isStreamNotice', () => {
    it('accepts a well-formed notice', () => {
        expect(isStreamNotice(notice('x'))).toBe(true);
    });

    it.each([null, 'notice', { type: 'status', message: 'x' }, { type: 'notice' }, { type: 'notice', message: 42 }])(
        'rejects %j',
        (entry) => {
            expect(isStreamNotice(entry)).toBe(false);
        }
    );
});

describe('useStreamNotice', () => {
    it('starts empty', () => {
        const { result } = renderHook(() => useStreamNotice([]));
        expect(result.current.notice).toBeNull();
    });

    it('picks up a notice even when a status arrives in the same batch', () => {
        // The orchestrator sends the notice, then status updates: React may
        // deliver both in one commit, so "look at the last entry" would lose it.
        const hook = renderHook(({ data }) => useStreamNotice(data), {
            initialProps: { data: [status('a')] as unknown[] },
        });

        hook.rerender({ data: [status('a'), notice('Video ignorato'), status('b')] });

        expect(hook.result.current.notice?.message).toBe('Video ignorato');
    });

    it('keeps the latest notice of the batch', () => {
        const hook = renderHook(({ data }) => useStreamNotice(data), { initialProps: { data: [] as unknown[] } });

        hook.rerender({ data: [notice('primo'), notice('secondo')] });

        expect(hook.result.current.notice?.message).toBe('secondo');
    });

    it('does not resurrect a dismissed notice when unrelated data arrives', () => {
        const hook = renderHook(({ data }) => useStreamNotice(data), { initialProps: { data: [] as unknown[] } });
        hook.rerender({ data: [notice('Video ignorato')] });

        act(() => hook.result.current.dismiss());
        hook.rerender({ data: [notice('Video ignorato'), status('altro')] });

        expect(hook.result.current.notice).toBeNull();
    });

    it('ignores notices that were already there when it mounted', () => {
        // The stream data lives in the root ChatProvider: a ChatWidget mounted on
        // another page must not replay an old (possibly dismissed) notice.
        const hook = renderHook(({ data }) => useStreamNotice(data), {
            initialProps: { data: [notice('vecchio')] as unknown[] },
        });
        expect(hook.result.current.notice).toBeNull();

        hook.rerender({ data: [notice('vecchio'), notice('nuovo')] });
        expect(hook.result.current.notice?.message).toBe('nuovo');
    });

    it('reads again from the start when the data is reset (new session)', () => {
        const hook = renderHook(({ data }) => useStreamNotice(data), {
            initialProps: { data: [status('a'), status('b'), status('c')] as unknown[] },
        });

        hook.rerender({ data: [] });
        hook.rerender({ data: [notice('nuova sessione')] });

        expect(hook.result.current.notice?.message).toBe('nuova sessione');
    });
});
