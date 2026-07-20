import { renderHook } from '@testing-library/react';
import { act } from 'react';
import type { ChatStatus, UIMessage as Message } from 'ai';
import type { Message as FirestoreMessage } from '@/types/chat';
import { useChatSync } from '../useChatSync';
import { WELCOME_MESSAGE } from '@/lib/chat/messages';

jest.useFakeTimers();

/**
 * Wiring-level tests only. The decision matrix (guard order, race conditions)
 * is covered exhaustively — and without React — in
 * lib/chat/__tests__/history-sync.test.ts.
 */

const SESSION = 'session-1';

function props(overrides: Partial<Parameters<typeof useChatSync>[0]> = {}) {
    return {
        messages: [] as Message[],
        setMessages: jest.fn(),
        historyMessages: [] as FirestoreMessage[],
        historyLoaded: true,
        loadedForSessionId: SESSION,
        sessionId: SESSION,
        status: 'ready' as ChatStatus,
        ...overrides,
    };
}

describe('useChatSync', () => {
    it('defers setMessages out of the effect commit', () => {
        const setMessages = jest.fn();
        renderHook(() => useChatSync(props({ setMessages })));

        // Cold start decided synchronously, applied only after the timer fires.
        expect(setMessages).not.toHaveBeenCalled();

        act(() => { jest.runAllTimers(); });

        expect(setMessages).toHaveBeenCalledWith([WELCOME_MESSAGE]);
    });

    it('cancels the pending write when unmounted before the timer fires', () => {
        const setMessages = jest.fn();
        const { unmount } = renderHook(() => useChatSync(props({ setMessages })));

        unmount();
        act(() => { jest.runAllTimers(); });

        expect(setMessages).not.toHaveBeenCalled();
    });

    it('does not write while the loaded session is stale', () => {
        const setMessages = jest.fn();
        renderHook(() =>
            useChatSync(props({ setMessages, loadedForSessionId: 'other-session' }))
        );

        act(() => { jest.runAllTimers(); });

        expect(setMessages).not.toHaveBeenCalled();
    });

    it('injects the welcome message only once across re-renders', () => {
        const setMessages = jest.fn();
        const { rerender } = renderHook((p: Parameters<typeof useChatSync>[0]) => useChatSync(p), {
            initialProps: props({ setMessages }),
        });

        act(() => { jest.runAllTimers(); });
        expect(setMessages).toHaveBeenCalledTimes(1);

        // The welcome message is now in SDK state and history is still empty:
        // the welcomeInjected ref must keep this a noop.
        rerender(props({ setMessages, messages: [WELCOME_MESSAGE] }));
        act(() => { jest.runAllTimers(); });

        expect(setMessages).toHaveBeenCalledTimes(1);
    });

    it('re-arms the per-session refs when the session changes', () => {
        const setMessages = jest.fn();
        const { rerender } = renderHook((p: Parameters<typeof useChatSync>[0]) => useChatSync(p), {
            initialProps: props({ setMessages }),
        });

        act(() => { jest.runAllTimers(); });
        setMessages.mockClear();

        // New session, fresh (empty) history: the welcome message must be
        // injected again rather than being suppressed by the previous session's ref.
        rerender(props({ setMessages, sessionId: 'session-2', loadedForSessionId: 'session-2' }));
        act(() => { jest.runAllTimers(); });

        expect(setMessages).toHaveBeenCalledWith([WELCOME_MESSAGE]);
    });
});
