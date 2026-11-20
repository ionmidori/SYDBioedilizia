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

function sdkMsg(id: string, text = id): Message {
    return { id, role: 'assistant', parts: [{ type: 'text', text }] } as unknown as Message;
}

function histMsg(id: string, content = id): FirestoreMessage {
    return { id, role: 'assistant', content };
}

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

    it('bumping clearGeneration allows a smaller historyMessages snapshot to replace sdkMessages, then disarms', () => {
        const setMessages = jest.fn();
        const { rerender } = renderHook((p: Parameters<typeof useChatSync>[0]) => useChatSync(p), {
            initialProps: props({
                setMessages,
                messages: [WELCOME_MESSAGE, sdkMsg('u1'), sdkMsg('a1')],
                historyMessages: [histMsg('u1'), histMsg('a1')],
                clearGeneration: 0,
            }),
        });

        act(() => { jest.runAllTimers(); });
        expect(setMessages).not.toHaveBeenCalled();

        // Chat cleared -> clearGeneration bumps and Firestore snapshot shrinks to empty.
        rerender(
            props({
                setMessages,
                messages: [WELCOME_MESSAGE, sdkMsg('u1'), sdkMsg('a1')],
                historyMessages: [],
                clearGeneration: 1,
            }),
        );
        act(() => { jest.runAllTimers(); });
        expect(setMessages).toHaveBeenCalledWith([WELCOME_MESSAGE]);

        setMessages.mockClear();

        // Subsequent optimistic turn while Firestore is briefly behind must remain protected.
        rerender(
            props({
                setMessages,
                messages: [WELCOME_MESSAGE, sdkMsg('u2')],
                historyMessages: [],
                clearGeneration: 1,
                status: 'ready',
            }),
        );
        act(() => { jest.runAllTimers(); });
        expect(setMessages).not.toHaveBeenCalled();
    });

    it('does not revert optimistically cleared sdkMessages to a stale pre-clear snapshot, then disarms once shrunk', () => {
        const setMessages = jest.fn();
        const staleHistory = [histMsg('u1'), histMsg('a1')];
        const { rerender } = renderHook((p: Parameters<typeof useChatSync>[0]) => useChatSync(p), {
            initialProps: props({
                setMessages,
                messages: [WELCOME_MESSAGE, sdkMsg('u1'), sdkMsg('a1')],
                historyMessages: staleHistory,
                clearGeneration: 0,
            }),
        });

        act(() => { jest.runAllTimers(); });
        expect(setMessages).not.toHaveBeenCalled();

        // Optimistic clear runs immediately while Firestore snapshot still holds pre-clear messages.
        rerender(
            props({
                setMessages,
                messages: [WELCOME_MESSAGE],
                historyMessages: staleHistory,
                clearGeneration: 1,
            }),
        );
        act(() => { jest.runAllTimers(); });
        expect(setMessages).not.toHaveBeenCalled();

        // Firestore snapshot now catches up with empty history (already in sync, disarms allowShrink).
        rerender(
            props({
                setMessages,
                messages: [WELCOME_MESSAGE],
                historyMessages: [],
                clearGeneration: 1,
            }),
        );
        act(() => { jest.runAllTimers(); });
        expect(setMessages).not.toHaveBeenCalled();

        // Subsequent optimistic turn must NOT be wiped.
        rerender(
            props({
                setMessages,
                messages: [WELCOME_MESSAGE, sdkMsg('u2')],
                historyMessages: [],
                clearGeneration: 1,
                status: 'ready',
            }),
        );
        act(() => { jest.runAllTimers(); });
        expect(setMessages).not.toHaveBeenCalled();
    });

    it('disarms allowShrink after syncing to welcome-only following cold start', () => {
        const setMessages = jest.fn();
        const { rerender } = renderHook((p: Parameters<typeof useChatSync>[0]) => useChatSync(p), {
            initialProps: props({
                setMessages,
                messages: [],
                historyMessages: [],
                clearGeneration: 0,
            }),
        });

        // Cold start sets welcomeInjectedRef = true.
        act(() => { jest.runAllTimers(); });
        expect(setMessages).toHaveBeenCalledWith([WELCOME_MESSAGE]);
        setMessages.mockClear();

        // User had one turn, then cleared and snapshot arrived as empty.
        rerender(
            props({
                setMessages,
                messages: [WELCOME_MESSAGE, sdkMsg('u1')],
                historyMessages: [histMsg('u1')],
                clearGeneration: 0,
            }),
        );
        act(() => { jest.runAllTimers(); });
        expect(setMessages).not.toHaveBeenCalled();

        rerender(
            props({
                setMessages,
                messages: [WELCOME_MESSAGE],
                historyMessages: [],
                clearGeneration: 1,
            }),
        );
        act(() => { jest.runAllTimers(); });
        expect(setMessages).not.toHaveBeenCalled();

        // Next optimistic message must not be wiped by a still-armed allowShrinkRef.
        rerender(
            props({
                setMessages,
                messages: [WELCOME_MESSAGE, sdkMsg('u2')],
                historyMessages: [],
                clearGeneration: 1,
                status: 'ready',
            }),
        );
        act(() => { jest.runAllTimers(); });
        expect(setMessages).not.toHaveBeenCalled();
    });
});
