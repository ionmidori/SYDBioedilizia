import type { ChatStatus, UIMessage as Message } from 'ai';
import { planHistorySync, type HistorySyncInput } from '../history-sync';
import { WELCOME_MESSAGE } from '../messages';

function msg(id: string, text = id): Message {
    return { id, role: 'assistant', parts: [{ type: 'text', text }] } as unknown as Message;
}

/** Defaults describe a settled, in-sync session; each test overrides what it exercises. */
function input(overrides: Partial<HistorySyncInput> = {}): HistorySyncInput {
    return {
        sdkMessages: [],
        fullHistory: [WELCOME_MESSAGE],
        historyLength: 0,
        status: 'ready' as ChatStatus,
        historyLoaded: true,
        sessionMatches: true,
        isFirstSync: false,
        welcomeInjected: true,
        ...overrides,
    };
}

describe('planHistorySync — guards', () => {
    it('skips while the loaded session does not match (stale Firestore snapshot)', () => {
        // Syncing here would re-populate the chat with the PREVIOUS session's messages.
        const decision = planHistorySync(
            input({ sessionMatches: false, historyLength: 3, isFirstSync: true })
        );
        expect(decision).toEqual({ kind: 'noop', reason: 'stale-session' });
    });

    it('skips until the history has loaded', () => {
        expect(planHistorySync(input({ historyLoaded: false })).reason).toBe('history-not-loaded');
    });

    it.each(['streaming', 'submitted'] as ChatStatus[])('skips while status is %s', (status) => {
        const decision = planHistorySync(
            input({ status, historyLength: 2, fullHistory: [WELCOME_MESSAGE, msg('a')] })
        );
        expect(decision).toEqual({ kind: 'noop', reason: 'streaming' });
    });
});

describe('planHistorySync — welcome message', () => {
    it('injects the welcome message on a cold start', () => {
        const decision = planHistorySync(input({ welcomeInjected: false, isFirstSync: true }));
        expect(decision).toEqual({
            kind: 'set',
            messages: [WELCOME_MESSAGE],
            reason: 'cold-start',
        });
    });

    it('does not re-inject once the welcome message is in place', () => {
        // Second pass: welcome already injected, history still empty.
        const decision = planHistorySync(
            input({ welcomeInjected: true, sdkMessages: [WELCOME_MESSAGE] })
        );
        expect(decision).toEqual({ kind: 'noop', reason: 'welcome-only' });
    });
});

describe('planHistorySync — reconciliation', () => {
    it('is a noop when the SDK state already matches the history', () => {
        const history = [WELCOME_MESSAGE, msg('a')];
        const decision = planHistorySync(
            input({ sdkMessages: history, fullHistory: history, historyLength: 1 })
        );
        expect(decision).toEqual({ kind: 'noop', reason: 'in-sync' });
    });

    it('waits for the snapshot instead of overwriting optimistic messages', () => {
        // Regression guard: the backend saves the user message AFTER streaming
        // completes, so Firestore is briefly shorter than the SDK state.
        // Applying the history here wipes the just-streamed reply.
        const decision = planHistorySync(
            input({
                status: 'ready',
                sdkMessages: [WELCOME_MESSAGE, msg('u1'), msg('a1')],
                fullHistory: [WELCOME_MESSAGE, msg('u1')],
                historyLength: 1,
                isFirstSync: true,
            })
        );
        expect(decision).toEqual({ kind: 'noop', reason: 'awaiting-snapshot' });
    });

    it('keeps awaiting-snapshot ahead of first-sync', () => {
        // Same input as above with isFirstSync: the ordering must NOT flip.
        const shorterHistory = planHistorySync(
            input({
                sdkMessages: [WELCOME_MESSAGE, msg('u1')],
                fullHistory: [WELCOME_MESSAGE],
                historyLength: 0,
                isFirstSync: true,
                welcomeInjected: false,
            })
        );
        expect(shorterHistory.reason).toBe('awaiting-snapshot');
    });

    it('performs the initial sync when the SDK state is empty', () => {
        const fullHistory = [WELCOME_MESSAGE, msg('u1'), msg('a1')];
        const decision = planHistorySync(
            input({ sdkMessages: [], fullHistory, historyLength: 2, isFirstSync: true })
        );
        expect(decision).toEqual({ kind: 'set', messages: fullHistory, reason: 'first-sync' });
    });

    it('takes over the Firestore ids when lengths match and the last text is identical', () => {
        // This used to be a dedicated `adopt-ids` branch. It returned exactly the
        // same set(fullHistory) as the fallthrough, so it was removed — the
        // outcome that matters is asserted here and must not change: the SDK ids
        // are replaced by the Firestore ones.
        const fullHistory = [WELCOME_MESSAGE, msg('firestore-id', 'stessa risposta')];
        const decision = planHistorySync(
            input({
                sdkMessages: [WELCOME_MESSAGE, msg('sdk-id', 'stessa risposta')],
                fullHistory,
                historyLength: 1,
            })
        );
        expect(decision).toEqual({ kind: 'set', messages: fullHistory, reason: 'length-mismatch' });
    });

    it('replaces the state the same way whether or not the trailing text matches', () => {
        // Guards the removal: identical vs differing trailing text used to pick
        // different branches. Both must still yield the same replacement.
        const fullHistory = [WELCOME_MESSAGE, msg('firestore-id', 'testo A')];
        const base = { fullHistory, historyLength: 1 };

        const sameText = planHistorySync(
            input({ ...base, sdkMessages: [WELCOME_MESSAGE, msg('sdk-id', 'testo A')] })
        );
        const differentText = planHistorySync(
            input({ ...base, sdkMessages: [WELCOME_MESSAGE, msg('sdk-id', 'testo B')] })
        );

        expect(sameText).toEqual(differentText);
    });

    it('replaces the state when the history is longer (another device / backend update)', () => {
        const fullHistory = [WELCOME_MESSAGE, msg('u1'), msg('a1')];
        const decision = planHistorySync(
            input({
                sdkMessages: [WELCOME_MESSAGE, msg('u1')],
                fullHistory,
                historyLength: 2,
                status: 'error',
            })
        );
        expect(decision).toEqual({ kind: 'set', messages: fullHistory, reason: 'length-mismatch' });
    });

    it('replaces the state when lengths match but the last text differs', () => {
        const fullHistory = [WELCOME_MESSAGE, msg('firestore-id', 'risposta finale')];
        const decision = planHistorySync(
            input({
                sdkMessages: [WELCOME_MESSAGE, msg('sdk-id', 'risposta parziale')],
                fullHistory,
                historyLength: 1,
            })
        );
        expect(decision).toEqual({
            kind: 'set',
            messages: fullHistory,
            reason: 'length-mismatch',
        });
    });
});
